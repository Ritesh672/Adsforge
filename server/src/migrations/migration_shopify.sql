CREATE TABLE products (
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
CREATE TABLE variants (
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
CREATE TABLE orders (
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
CREATE TABLE order_line_items (
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
CREATE TABLE returns (
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
CREATE TABLE sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL,
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Price History Table
CREATE TABLE price_history (
  id SERIAL PRIMARY KEY,
  variant_id INTEGER REFERENCES variants(id),
  price NUMERIC(10,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_line_items_product_id ON order_line_items(product_id);
CREATE INDEX idx_line_items_variant_id ON order_line_items(variant_id);
CREATE INDEX idx_orders_ordered_at ON orders(ordered_at);
CREATE INDEX idx_variants_product_id ON variants(product_id);
CREATE INDEX idx_returns_product_id ON returns(product_id);