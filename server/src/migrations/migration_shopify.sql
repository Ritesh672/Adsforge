CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  shopify_product_id BIGINT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  vendor TEXT,
  product_type TEXT,
  tags TEXT,
  status TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Variants Table
CREATE TABLE IF NOT EXISTS variants (
  id SERIAL PRIMARY KEY,
  shopify_variant_id BIGINT UNIQUE NOT NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  title TEXT,
  sku TEXT,
  price NUMERIC(10,2),
  compare_at_price NUMERIC(10,2),
  inventory_quantity INTEGER DEFAULT 0,
  size TEXT,
  color TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  shopify_order_id BIGINT UNIQUE NOT NULL,
  email TEXT,
  financial_status TEXT,
  fulfillment_status TEXT,
  total_price NUMERIC(10,2),
  total_items INTEGER,
  ordered_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order Line Items Table
CREATE TABLE IF NOT EXISTS order_line_items (
  id SERIAL PRIMARY KEY,
  shopify_line_item_id BIGINT UNIQUE NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  variant_id INTEGER REFERENCES variants(id),
  title TEXT,
  variant_title TEXT,
  quantity INTEGER,
  price NUMERIC(10,2),
  discount_amount NUMERIC(10,2) DEFAULT 0,
  size TEXT,
  color TEXT
);

-- Returns Table
CREATE TABLE IF NOT EXISTS returns (
  id SERIAL PRIMARY KEY,
  shopify_refund_id BIGINT UNIQUE NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  variant_id INTEGER REFERENCES variants(id),
  quantity INTEGER,
  reason TEXT,
  return_type TEXT,
  refund_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ
);

-- Sync Logs Table
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Price History Table
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER REFERENCES variants(id),
  price NUMERIC(10,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS shopify_product_id BIGINT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS vendor TEXT,
  ADD COLUMN IF NOT EXISTS product_type TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE variants
  ADD COLUMN IF NOT EXISTS shopify_variant_id BIGINT,
  ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shopify_order_id BIGINT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS financial_status TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT,
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS total_items INTEGER,
  ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE order_line_items
  ADD COLUMN IF NOT EXISTS shopify_line_item_id BIGINT,
  ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES variants(id),
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS variant_title TEXT,
  ADD COLUMN IF NOT EXISTS quantity INTEGER,
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS shopify_refund_id BIGINT,
  ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS product_id INTEGER REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES variants(id),
  ADD COLUMN IF NOT EXISTS quantity INTEGER,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS return_type TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS sync_type TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS records_synced INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES variants(id),
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_shopify_product_id_unique ON products(shopify_product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_shopify_variant_id_unique ON variants(shopify_variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shopify_order_id_unique ON orders(shopify_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_line_items_shopify_line_item_id_unique ON order_line_items(shopify_line_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_shopify_refund_id_unique ON returns(shopify_refund_id);
CREATE INDEX IF NOT EXISTS idx_line_items_product_id ON order_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_line_items_variant_id ON order_line_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON orders(ordered_at);
CREATE INDEX IF NOT EXISTS idx_variants_product_id ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_product_id ON returns(product_id);
CREATE INDEX IF NOT EXISTS idx_returns_created_at ON returns(created_at);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at DESC);
