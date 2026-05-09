const pLimit = require('p-limit');
const pool = require('../config/db');
const { fetchAllProducts, fetchAllOrders, fetchAllRefunds } = require('../services/shopify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runBackfill = async () => {
  const syncLogId = await startSyncLog('backfill');
  let productsSynced = 0;
  let ordersSynced = 0;
  let lineItemsSynced = 0;
  let returnsSynced = 0;
  let recordsFailed = 0;

  try {
    process.stdout.write('\n================================================\n');
    process.stdout.write('🚀 Starting Shopify Backfill Migration\n');
    process.stdout.write('================================================\n\n');

    // 1. Sync Products and Variants (Sequential)
    process.stdout.write('📦 Step 1: Fetching Products...\n');
    const products = await fetchAllProducts();
    const totalProducts = products.length;
    process.stdout.write(`✅ Found ${totalProducts} products to sync.\n`);

    for (let i = 0; i < totalProducts; i++) {
      const product = products[i];
      try {
        const imageUrl = product.image ? product.image.src : (product.images && product.images.length > 0 ? product.images[0].src : null);
        
        const productResult = await pool.query(
          `INSERT INTO products (shopify_product_id, title, vendor, product_type, tags, status, image_url, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (shopify_product_id) DO UPDATE SET
              title = EXCLUDED.title,
              vendor = EXCLUDED.vendor,
              product_type = EXCLUDED.product_type,
              tags = EXCLUDED.tags,
              status = EXCLUDED.status,
              image_url = EXCLUDED.image_url,
              updated_at = EXCLUDED.updated_at,
              synced_at = NOW()
           RETURNING id`,
          [product.id, product.title, product.vendor, product.product_type, product.tags, product.status, imageUrl, product.created_at, product.updated_at]
        );
        
        const dbProductId = productResult.rows[0].id;

        for (const variant of product.variants) {
          const { size, color } = parseVariantTitle(variant.title);
          await pool.query(
            `INSERT INTO variants (shopify_variant_id, product_id, title, sku, price, compare_at_price, inventory_quantity, size, color, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (shopify_variant_id) DO UPDATE SET
                title = EXCLUDED.title,
                sku = EXCLUDED.sku,
                price = EXCLUDED.price,
                compare_at_price = EXCLUDED.compare_at_price,
                inventory_quantity = EXCLUDED.inventory_quantity,
                size = EXCLUDED.size,
                color = EXCLUDED.color,
                updated_at = EXCLUDED.updated_at`,
            [variant.id, dbProductId, variant.title, variant.sku, variant.price, variant.compare_at_price, variant.inventory_quantity, size, color, variant.created_at, variant.updated_at]
          );
        }
        productsSynced++;
      } catch (err) {
        process.stdout.write(`✗ Failed product ${product.id}: ${err.message}\n`);
        recordsFailed++;
      }
    }
    process.stdout.write(`✅ Step 1 Complete: ${productsSynced} products synced.\n`);

    // 2. Sync Orders and Line Items (Sequential)
    process.stdout.write('\n🧾 Step 2: Fetching Orders (Last 12 Months)...\n');
    const orders = await fetchAllOrders(365);
    const totalOrders = orders.length;
    process.stdout.write(`✅ Found ${totalOrders} orders to sync.\n`);

    for (let i = 0; i < totalOrders; i++) {
      const order = orders[i];
      try {
        const fulfilledAt = order.fulfillments && order.fulfillments.length > 0 
          ? order.fulfillments[0].created_at 
          : null;

        const totalItems = order.line_items.reduce((sum, item) => sum + item.quantity, 0);

        const orderResult = await pool.query(
          `INSERT INTO orders (shopify_order_id, email, financial_status, fulfillment_status, total_price, total_items, ordered_at, fulfilled_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (shopify_order_id) DO UPDATE SET
              financial_status = EXCLUDED.financial_status,
              fulfillment_status = EXCLUDED.fulfillment_status,
              total_price = EXCLUDED.total_price,
              total_items = EXCLUDED.total_items,
              fulfilled_at = EXCLUDED.fulfilled_at
           RETURNING id`,
          [order.id, order.email, order.financial_status, order.fulfillment_status, order.total_price, totalItems, order.created_at, fulfilledAt]
        );

        const dbOrderId = orderResult.rows[0].id;

        for (const item of order.line_items) {
          const productRef = await pool.query('SELECT id FROM products WHERE shopify_product_id = $1', [item.product_id]);
          const variantRef = await pool.query('SELECT id FROM variants WHERE shopify_variant_id = $1', [item.variant_id]);
          
          const dbProdId = productRef.rows[0]?.id || null;
          const dbVarId = variantRef.rows[0]?.id || null;
          const { size, color } = parseVariantTitle(item.variant_title);

          const discountAmount = item.discount_allocations 
            ? item.discount_allocations.reduce((sum, d) => sum + parseFloat(d.amount), 0)
            : 0;

          await pool.query(
            `INSERT INTO order_line_items (shopify_line_item_id, order_id, product_id, variant_id, title, variant_title, quantity, price, discount_amount, size, color)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (shopify_line_item_id) DO UPDATE SET
                quantity = EXCLUDED.quantity,
                price = EXCLUDED.price,
                discount_amount = EXCLUDED.discount_amount,
                size = EXCLUDED.size,
                color = EXCLUDED.color`,
            [item.id, dbOrderId, dbProdId, dbVarId, item.title, item.variant_title, item.quantity, item.price, discountAmount, size, color]
          );
          lineItemsSynced++;
        }

        ordersSynced++;
        if (ordersSynced % 100 === 0) {
          process.stdout.write(`[Progress] Processed ${ordersSynced}/${totalOrders} orders\n`);
        }
      } catch (err) {
        process.stdout.write(`✗ Failed order ${order.id}: ${err.message}\n`);
        recordsFailed++;
      }
    }
    process.stdout.write(`✅ Step 2 Complete: ${ordersSynced} orders synced.\n`);

    // 3. Sync Refunds/Returns (Optimized)
    process.stdout.write('\n🔄 Step 3: Fetching Refunds (Recent & Necessary Only)...\n');
    
    // Get list of orders that already have returns synced
    const existingReturnsRes = await pool.query('SELECT DISTINCT order_id FROM returns');
    const ordersWithReturns = new Set(existingReturnsRes.rows.map(r => r.order_id));

    const limit = pLimit(1); // One at a time to be safe with rate limits
    const refundPromises = orders.map((order) => {
      return limit(async () => {
        try {
          const dbOrderRef = await pool.query('SELECT id, financial_status FROM orders WHERE shopify_order_id = $1', [order.id]);
          const dbOrder = dbOrderRef.rows[0];
          if (!dbOrder) return;

          const isOld = new Date(order.created_at) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const hasReturns = ordersWithReturns.has(dbOrder.id);

          // Optimization: Skip if it's an old order that is already "paid" (unlikely to have new refund)
          // OR if it's an old order and we already have its returns
          if (isOld && (dbOrder.financial_status === 'paid' || hasReturns)) {
            return;
          }

          const refunds = await fetchAllRefunds(order.id);
          await delay(200); // Small breath between orders

          for (const refund of refunds) {
            const refundAmount = refund.transactions
              ? refund.transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0)
              : 0;

            for (const rItem of refund.refund_line_items) {
              const lineItem = rItem.line_item;
              const productRef = await pool.query('SELECT id FROM products WHERE shopify_product_id = $1', [lineItem.product_id]);
              const variantRef = await pool.query('SELECT id FROM variants WHERE shopify_variant_id = $1', [lineItem.variant_id]);

              let returnType = 'store_credit';
              if (rItem.restock_type === 'return') returnType = 'refund';
              if (rItem.restock_type === 'exchange') returnType = 'exchange';

              await pool.query(
                `INSERT INTO returns (shopify_refund_id, order_id, product_id, variant_id, quantity, reason, return_type, refund_amount, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (shopify_refund_id) DO UPDATE SET
                    quantity = EXCLUDED.quantity,
                    reason = EXCLUDED.reason,
                    return_type = EXCLUDED.return_type,
                    refund_amount = EXCLUDED.refund_amount`,
                [refund.id, dbOrder.id, productRef.rows[0]?.id || null, variantRef.rows[0]?.id || null, rItem.quantity, refund.note, returnType, refundAmount, refund.created_at]
              );
              returnsSynced++;
            }
          }
        } catch (err) {
          process.stdout.write(`✗ Failed refund sync for order ${order.id}: ${err.message}\n`);
        }
      });
    });

    await Promise.all(refundPromises);
    process.stdout.write('✅ Step 3 Complete.\n');

    process.stdout.write('\n================================================\n');
    process.stdout.write('✨ SUCCESS: Backfill Migration Complete\n');
    process.stdout.write('================================================\n');
    process.stdout.write(`📊 FINAL SUMMARY:\n`);
    process.stdout.write(`- Products: ${productsSynced}\n`);
    process.stdout.write(`- Orders: ${ordersSynced}\n`);
    process.stdout.write(`- Line Items: ${lineItemsSynced}\n`);
    process.stdout.write(`- Returns: ${returnsSynced}\n`);
    process.stdout.write(`- Total Failures: ${recordsFailed}\n`);
    process.stdout.write('================================================\n\n');

    await completeSyncLog(syncLogId, 'completed', ordersSynced);
  } catch (error) {
    process.stdout.write(`\n❌ CRITICAL ERROR DURING BACKFILL: ${error.message}\n`);
    await completeSyncLog(syncLogId, 'failed', ordersSynced, error.message);
    throw error;
  }
};

function parseVariantTitle(title) {
  if (!title) return { size: null, color: null };
  if (!title.includes(' / ')) return { size: title, color: null };
  const parts = title.split(' / ');
  return {
    size: parts[0] || null,
    color: parts[1] || null
  };
}

async function startSyncLog(type) {
  const res = await pool.query(
    'INSERT INTO sync_logs (sync_type, status) VALUES ($1, $2) RETURNING id',
    [type, 'in_progress']
  );
  return res.rows[0].id;
}

async function completeSyncLog(id, status, records, error = null) {
  await pool.query(
    'UPDATE sync_logs SET status = $1, records_synced = $2, error_message = $3, completed_at = NOW() WHERE id = $4',
    [status, records, error, id]
  );
}

const runIncrementalSync = async () => {
  const syncLogId = await startSyncLog('incremental_sync');
  let ordersSynced = 0;

  try {
    process.stdout.write('\n⚡ Starting Incremental Shopify Sync...\n');

    // 1. Find last order date
    const lastOrderRes = await pool.query('SELECT MAX(ordered_at) FROM orders');
    const lastOrderDate = lastOrderRes.rows[0]?.max;
    
    let sinceDate;
    if (lastOrderDate) {
      // Buffer by 1 minute to catch any orders missed at the exact second
      sinceDate = new Date(new Date(lastOrderDate).getTime() + 60000);
      process.stdout.write(`🔍 Syncing orders since: ${sinceDate.toISOString()}\n`);
    } else {
      process.stdout.write('⚠️ No previous orders found. Falling back to 7 days.\n');
      sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    // 2. Fetch new orders
    const orders = await fetchAllOrders(null, sinceDate);
    const totalOrders = orders.length;
    process.stdout.write(`✅ Found ${totalOrders} new orders to sync.\n`);

    if (totalOrders === 0) {
      process.stdout.write('✨ Already up to date. No new orders found.\n');
      await completeSyncLog(syncLogId, 'completed', 0);
      return { success: true, records_synced: 0 };
    }

    // 3. Reuse order sync logic
    // (For brevity in this file, we call a new private helper we'll create below)
    ordersSynced = await processOrderBatch(orders);

    process.stdout.write(`\n✨ SUCCESS: Incremental Sync Complete (${ordersSynced} orders)\n`);
    await completeSyncLog(syncLogId, 'completed', ordersSynced);
    return { success: true, records_synced: ordersSynced };

  } catch (error) {
    process.stdout.write(`\n❌ ERROR DURING INCREMENTAL SYNC: ${error.message}\n`);
    await completeSyncLog(syncLogId, 'failed', 0, error.message);
    throw error;
  }
};

/**
 * Shared order processing logic
 */
async function processOrderBatch(orders) {
  let synced = 0;
  const existingReturnsRes = await pool.query('SELECT DISTINCT order_id FROM returns');
  const ordersWithReturns = new Set(existingReturnsRes.rows.map(r => r.order_id));

  for (const order of orders) {
    try {
      const fulfilledAt = order.fulfillments && order.fulfillments.length > 0 ? order.fulfillments[0].created_at : null;
      const totalItems = order.line_items.reduce((sum, item) => sum + item.quantity, 0);

      const orderResult = await pool.query(
        `INSERT INTO orders (shopify_order_id, email, financial_status, fulfillment_status, total_price, total_items, ordered_at, fulfilled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (shopify_order_id) DO UPDATE SET
            financial_status = EXCLUDED.financial_status,
            fulfillment_status = EXCLUDED.fulfillment_status,
            total_price = EXCLUDED.total_price,
            total_items = EXCLUDED.total_items,
            fulfilled_at = EXCLUDED.fulfilled_at
         RETURNING id`,
        [order.id, order.email, order.financial_status, order.fulfillment_status, order.total_price, totalItems, order.created_at, fulfilledAt]
      );

      const dbOrderId = orderResult.rows[0].id;

      for (const item of order.line_items) {
        const productRef = await pool.query('SELECT id FROM products WHERE shopify_product_id = $1', [item.product_id]);
        const variantRef = await pool.query('SELECT id FROM variants WHERE shopify_variant_id = $1', [item.variant_id]);
        const { size, color } = parseVariantTitle(item.variant_title);
        const discountAmount = item.discount_allocations ? item.discount_allocations.reduce((sum, d) => sum + parseFloat(d.amount), 0) : 0;

        await pool.query(
          `INSERT INTO order_line_items (shopify_line_item_id, order_id, product_id, variant_id, title, variant_title, quantity, price, discount_amount, size, color)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (shopify_line_item_id) DO UPDATE SET
              quantity = EXCLUDED.quantity, price = EXCLUDED.price, discount_amount = EXCLUDED.discount_amount, size = EXCLUDED.size, color = EXCLUDED.color`,
          [item.id, dbOrderId, productRef.rows[0]?.id || null, variantRef.rows[0]?.id || null, item.title, item.variant_title, item.quantity, item.price, discountAmount, size, color]
        );
      }

      // Sync Refunds for this order
      const refunds = await fetchAllRefunds(order.id);
      for (const refund of refunds) {
        const refundAmount = refund.transactions ? refund.transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0) : 0;
        for (const rItem of refund.refund_line_items) {
          const lineItem = rItem.line_item;
          const productRef = await pool.query('SELECT id FROM products WHERE shopify_product_id = $1', [lineItem.product_id]);
          const variantRef = await pool.query('SELECT id FROM variants WHERE shopify_variant_id = $1', [lineItem.variant_id]);

          let returnType = 'store_credit';
          if (rItem.restock_type === 'return') returnType = 'refund';
          if (rItem.restock_type === 'exchange') returnType = 'exchange';

          await pool.query(
            `INSERT INTO returns (shopify_refund_id, order_id, product_id, variant_id, quantity, reason, return_type, refund_amount, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (shopify_refund_id) DO UPDATE SET
                quantity = EXCLUDED.quantity, reason = EXCLUDED.reason, return_type = EXCLUDED.return_type, refund_amount = EXCLUDED.refund_amount`,
            [refund.id, dbOrderId, productRef.rows[0]?.id || null, variantRef.rows[0]?.id || null, rItem.quantity, refund.note, returnType, refundAmount, refund.created_at]
          );
        }
      }
      
      synced++;
    } catch (err) {
      process.stdout.write(`✗ Failed processing order ${order.id}: ${err.message}\n`);
    }
  }
  return synced;
}

module.exports = { runBackfill, runIncrementalSync };
