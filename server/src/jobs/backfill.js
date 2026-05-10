const pool = require('../config/db');
const { fetchAllProducts, fetchAllOrders, fetchAllRefunds } = require('../services/shopify');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const REFUND_SYNC_DAYS = parseInt(process.env.REFUND_SYNC_DAYS || '365', 10);

// Helper for IST Timestamp
const getISTTime = () => {
  return new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }) + " IST";
};

const log = (msg) => {
  process.stdout.write(`[${getISTTime()}] ${msg}\n`);
};

const isTransientDbError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('connection terminated') ||
    message.includes('connection timeout') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('terminating connection') ||
    message.includes('client has encountered a connection error')
  );
};

const queryWithRetry = async (text, params = [], retries = 4) => {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      lastError = error;
      if (!isTransientDbError(error) || attempt === retries) break;

      const waitMs = 500 * attempt;
      log(`DB retry ${attempt}/${retries} after transient error: ${error.message}`);
      await delay(waitMs);
    }
  }

  throw lastError;
};

const getRefundRowId = (refund, refundLineItem) => {
  return (refund.refund_line_items || []).length > 1
    ? (refundLineItem?.id || refund.id)
    : refund.id;
};

const runBackfill = async () => {
  const syncLogId = await startSyncLog('backfill');
  let productsSynced = 0;
  let ordersSynced = 0;
  let lineItemsSynced = 0;
  let returnsSynced = 0;
  let recordsFailed = 0;

  try {
    log('================================================');
    log('🚀 STARTING SHOPIFY BACKFILL MIGRATION');
    log('================================================');

    // 1. Sync Products and Variants
    log('📦 STEP 1: Fetching all products from Shopify...');
    const products = await fetchAllProducts();
    const totalProducts = products.length;
    log(`✅ Found ${totalProducts} products. Starting database sync...`);

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
        if (productsSynced % 50 === 0) log(`[Progress] Synced ${productsSynced}/${totalProducts} products`);
      } catch (err) {
        log(`✗ FAILED Product ${product.id}: ${err.message}`);
        recordsFailed++;
      }
    }
    log(`✅ Step 1 Complete: ${productsSynced} products synced.`);

    // 2. Sync Orders and Line Items
    log('\n🧾 STEP 2: Fetching Orders (Last 12 Months)...');
    const orders = await fetchAllOrders(365);
    const totalOrders = orders.length;
    log(`✅ Found ${totalOrders} orders. Starting database sync...`);

    for (let i = 0; i < totalOrders; i++) {
      const order = orders[i];
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

        // Process Line Items
        for (const item of order.line_items) {
          const productRef = await pool.query('SELECT id FROM products WHERE shopify_product_id = $1', [item.product_id]);
          const variantRef = await pool.query('SELECT id FROM variants WHERE shopify_variant_id = $1', [item.variant_id]);
          const { size, color } = parseVariantTitle(item.variant_title);
          const discountAmount = item.discount_allocations ? item.discount_allocations.reduce((sum, d) => parseFloat(sum) + parseFloat(d.amount), 0) : 0;

          await pool.query(
            `INSERT INTO order_line_items (shopify_line_item_id, order_id, product_id, variant_id, title, variant_title, quantity, price, discount_amount, size, color)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (shopify_line_item_id) DO UPDATE SET
                quantity = EXCLUDED.quantity, price = EXCLUDED.price, discount_amount = EXCLUDED.discount_amount, size = EXCLUDED.size, color = EXCLUDED.color`,
            [item.id, dbOrderId, productRef.rows[0]?.id || null, variantRef.rows[0]?.id || null, item.title, item.variant_title, item.quantity, item.price, discountAmount, size, color]
          );
          lineItemsSynced++;
        }

        // Process refunds through the Shopify REST refunds endpoint.
        const refunds = await fetchAllRefunds(order.id);
        for (const refund of refunds) {
          const refundAmount = refund.transactions ? refund.transactions.reduce((sum, t) => parseFloat(sum) + parseFloat(t.amount), 0) : 0;
          for (const rItem of refund.refund_line_items || []) {
            const lineItem = rItem.line_item || {};
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
              [getRefundRowId(refund, rItem), dbOrderId, productRef.rows[0]?.id || null, variantRef.rows[0]?.id || null, rItem.quantity, refund.note, returnType, refundAmount, refund.created_at]
            );
            returnsSynced++;
          }
        }

        ordersSynced++;
        if (ordersSynced % 50 === 0) {
          log(`[Progress] Synced ${ordersSynced}/${totalOrders} orders (Last ID: ${order.id})`);
        }
      } catch (err) {
        log(`✗ FAILED Order ${order.id}: ${err.message}`);
        recordsFailed++;
      }
    }
    log(`✅ Steps 2 & 3 Complete: ${ordersSynced} orders and their refunds synced.`);

    log('\n================================================');
    log('✨ SUCCESS: BACKFILL MIGRATION COMPLETE');
    log('================================================');
    log(`📊 FINAL SUMMARY:`);
    log(`- Products: ${productsSynced}`);
    log(`- Orders: ${ordersSynced}`);
    log(`- Line Items: ${lineItemsSynced}`);
    log(`- Returns: ${returnsSynced}`);
    log(`- Total Failures: ${recordsFailed}`);
    log('================================================\n');

    await completeSyncLog(syncLogId, 'completed', ordersSynced);
  } catch (error) {
    log(`\n❌ CRITICAL ERROR DURING BACKFILL: ${error.message}`);
    console.error(error); // Log full stack trace
    await completeSyncLog(syncLogId, 'failed', ordersSynced, error.message);
    throw error;
  }
};

function parseVariantTitle(title) {
  if (!title) return { size: null, color: null };
  if (!title.includes(' / ')) return { size: title.trim(), color: null };
  const parts = title.split(' / ');
  return {
    size: parts[0] ? parts[0].trim() : null,
    color: parts[1] ? parts[1].trim() : null
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
  try {
    log('⚡ Starting Incremental Shopify Sync...');
    const lastOrderRes = await pool.query('SELECT MAX(ordered_at) FROM orders');
    const lastOrderDate = lastOrderRes.rows[0]?.max;
    
    // Re-read a short overlap because Shopify can return multiple orders in the same minute
    // and late writes can arrive around the previous high-water mark. Upserts prevent duplicates.
    const sinceDate = lastOrderDate ? new Date(new Date(lastOrderDate).getTime() - 10 * 60 * 1000) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    log(`🔍 Syncing orders since: ${sinceDate.toISOString()}`);

    const orders = await fetchAllOrders(null, sinceDate);
    if (orders.length === 0) {
      log('✨ Already up to date.');
      await completeSyncLog(syncLogId, 'completed', 0);
      return { success: true, records_synced: 0 };
    }

    const synced = await processOrderBatch(orders);
    log(`✨ SUCCESS: Incremental Sync Complete (${synced} orders)`);
    await completeSyncLog(syncLogId, 'completed', synced);
    return { success: true, records_synced: synced };
  } catch (error) {
    log(`❌ ERROR DURING INCREMENTAL SYNC: ${error.message}`);
    await completeSyncLog(syncLogId, 'failed', 0, error.message);
    throw error;
  }
};

async function processOrderBatch(orders) {
  let synced = 0;
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

          await queryWithRetry(
            `INSERT INTO returns (shopify_refund_id, order_id, product_id, variant_id, quantity, reason, return_type, refund_amount, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (shopify_refund_id) DO UPDATE SET
                quantity = EXCLUDED.quantity, reason = EXCLUDED.reason, return_type = EXCLUDED.return_type, refund_amount = EXCLUDED.refund_amount`,
            [getRefundRowId(refund, rItem), dbOrderId, productRef.rows[0]?.id || null, variantRef.rows[0]?.id || null, rItem.quantity, refund.note, returnType, refundAmount, refund.created_at]
          );
        }
      }
      synced++;
    } catch (err) {
      log(`✗ FAILED processing order ${order.id}: ${err.message}`);
    }
  }
  return synced;
}

const runRefundSync = async () => {
  const syncLogId = await startSyncLog('refund_sync');
  let returnsSynced = 0;
  let ordersChecked = 0;
  let ordersFailed = 0;

  try {
    log('========================================');
    log(`Starting refund-only sync for last ${REFUND_SYNC_DAYS} days`);
    log('========================================');

    const ordersRes = await queryWithRetry(
      `SELECT id, shopify_order_id
       FROM orders
       WHERE ordered_at >= NOW() - ($1::INTEGER || ' days')::INTERVAL
       ORDER BY ordered_at DESC`,
      [REFUND_SYNC_DAYS]
    );

    const orders = ordersRes.rows;
    log(`Found ${orders.length} orders to check for refunds`);

    for (const order of orders) {
      try {
        ordersChecked++;
        const refunds = await fetchAllRefunds(order.shopify_order_id);
        await delay(150);

        for (const refund of refunds) {
          const refundAmount = refund.transactions
            ? refund.transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0)
            : 0;

          for (const rItem of refund.refund_line_items || []) {
            const lineItem = rItem.line_item || {};
            const productRef = await queryWithRetry('SELECT id FROM products WHERE shopify_product_id = $1', [lineItem.product_id]);
            const variantRef = await queryWithRetry('SELECT id FROM variants WHERE shopify_variant_id = $1', [lineItem.variant_id]);

            let returnType = 'store_credit';
            if (rItem.restock_type === 'return') returnType = 'refund';
            if (rItem.restock_type === 'exchange') returnType = 'exchange';

            await queryWithRetry(
              `INSERT INTO returns (shopify_refund_id, order_id, product_id, variant_id, quantity, reason, return_type, refund_amount, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               ON CONFLICT (shopify_refund_id) DO UPDATE SET
                  quantity = EXCLUDED.quantity,
                  reason = EXCLUDED.reason,
                  return_type = EXCLUDED.return_type,
                  refund_amount = EXCLUDED.refund_amount,
                  product_id = EXCLUDED.product_id,
                  variant_id = EXCLUDED.variant_id,
                  created_at = EXCLUDED.created_at`,
              [
                getRefundRowId(refund, rItem),
                order.id,
                productRef.rows[0]?.id || null,
                variantRef.rows[0]?.id || null,
                rItem.quantity,
                refund.note,
                returnType,
                refundAmount,
                refund.created_at,
              ]
            );
            returnsSynced++;
          }
        }

        if (ordersChecked % 25 === 0) {
          log(`[Progress] Checked ${ordersChecked}/${orders.length} orders, synced ${returnsSynced} refund rows`);
        }
      } catch (error) {
        ordersFailed++;
        log(`FAILED Refund for order ${order.shopify_order_id}: ${error.message}`);
      }
    }

    log('========================================');
    log('Refund-only sync completed');
    log(`Orders checked: ${ordersChecked}`);
    log(`Refund rows synced: ${returnsSynced}`);
    log(`Orders failed: ${ordersFailed}`);
    log('========================================');

    await completeSyncLog(syncLogId, 'completed', returnsSynced);
    return { success: true, orders_checked: ordersChecked, returns_synced: returnsSynced, orders_failed: ordersFailed };
  } catch (error) {
    await completeSyncLog(syncLogId, 'failed', returnsSynced, error.message);
    throw error;
  }
};

module.exports = { runBackfill, runIncrementalSync, runRefundSync };
