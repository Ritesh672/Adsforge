-- Performance indexes for product browsing, dashboard analytics, and sync lookups.
-- Safe to run multiple times in Supabase SQL editor or through the local migration script.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_orders_ordered_at_id
  ON orders (ordered_at, id);

CREATE INDEX IF NOT EXISTS idx_orders_financial_ordered_at
  ON orders (financial_status, ordered_at);

CREATE INDEX IF NOT EXISTS idx_order_line_items_order_product
  ON order_line_items (order_id, product_id);

CREATE INDEX IF NOT EXISTS idx_order_line_items_product_order
  ON order_line_items (product_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_line_items_variant_order
  ON order_line_items (variant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_returns_product_created_at
  ON returns (product_id, created_at);

CREATE INDEX IF NOT EXISTS idx_returns_order_id
  ON returns (order_id);

CREATE INDEX IF NOT EXISTS idx_variants_product_inventory
  ON variants (product_id, inventory_quantity);

CREATE INDEX IF NOT EXISTS idx_products_status
  ON products (status);

CREATE INDEX IF NOT EXISTS idx_products_title_trgm
  ON products USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_price_history_variant_recorded_at
  ON price_history (variant_id, recorded_at DESC);
