const pool = require('../config/db');

const handleOrderCreate = async (payload) => {
  console.log('Webhook: Order Create', payload.id);
  await upsertOrder(payload);
};

const handleOrderUpdate = async (payload) => {
  console.log('Webhook: Order Update', payload.id);
  await upsertOrder(payload);
};

const handleRefundCreate = async (payload) => {
  console.log('Webhook: Refund Create', payload.id);
  const dbOrderRef = await pool.query('SELECT id FROM orders WHERE shopify_order_id = $1', [payload.order_id]);
  const dbOrderId = dbOrderRef.rows[0]?.id;

  for (const rItem of payload.refund_line_items) {
    const lineItem = rItem.line_item;
    const productRef = await pool.query('SELECT id FROM products WHERE shopify_product_id = $1', [lineItem.product_id]);
    const variantRef = await pool.query('SELECT id FROM variants WHERE shopify_variant_id = $1', [lineItem.variant_id]);

    await pool.query(
      `INSERT INTO returns (shopify_refund_id, order_id, product_id, variant_id, quantity, reason, refund_amount, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (shopify_refund_id) DO UPDATE SET
          quantity = EXCLUDED.quantity,
          refund_amount = EXCLUDED.refund_amount`,
      [payload.id, dbOrderId, productRef.rows[0]?.id || null, variantRef.rows[0]?.id || null, rItem.quantity, payload.note, rItem.subtotal, payload.created_at]
    );
  }
};

const handleProductUpdate = async (payload) => {
  console.log('Webhook: Product Update', payload.id);
  
  const imageUrl = payload.image ? payload.image.src : (payload.images && payload.images.length > 0 ? payload.images[0].src : null);

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
    [payload.id, payload.title, payload.vendor, payload.product_type, payload.tags, payload.status, imageUrl, payload.created_at, payload.updated_at]
  );
  
  const dbProductId = productResult.rows[0].id;

  for (const variant of payload.variants) {
    const oldVariant = await pool.query('SELECT price FROM variants WHERE shopify_variant_id = $1', [variant.id]);
    const oldPrice = oldVariant.rows[0]?.price;

    const { size, color } = parseVariantTitle(variant.title);
    const variantResult = await pool.query(
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
          updated_at = EXCLUDED.updated_at
       RETURNING id, price`,
      [variant.id, dbProductId, variant.title, variant.sku, variant.price, variant.compare_at_price, variant.inventory_quantity, size, color, variant.created_at, variant.updated_at]
    );

    const dbVariantId = variantResult.rows[0].id;

    if (oldPrice && parseFloat(oldPrice) !== parseFloat(variant.price)) {
      console.log(`Price changed for variant ${variant.id}: ${oldPrice} -> ${variant.price}`);
      await pool.query(
        'INSERT INTO price_history (variant_id, price) VALUES ($1, $2)',
        [dbVariantId, variant.price]
      );
    }
  }
};

async function upsertOrder(order) {
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

    await pool.query(
      `INSERT INTO order_line_items (shopify_line_item_id, order_id, product_id, variant_id, title, variant_title, quantity, price, discount_amount, size, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (shopify_line_item_id) DO UPDATE SET
          quantity = EXCLUDED.quantity,
          price = EXCLUDED.price,
          discount_amount = EXCLUDED.discount_amount`,
      [item.id, dbOrderId, dbProdId, dbVarId, item.title, item.variant_title, item.quantity, item.price, item.total_discount, size, color]
    );
  }
}

function parseVariantTitle(title) {
  if (!title) return { size: null, color: null };
  const parts = title.split(' / ');
  return { size: parts[0] || null, color: parts[1] || null };
}

module.exports = {
  handleOrderCreate,
  handleOrderUpdate,
  handleRefundCreate,
  handleProductUpdate
};
