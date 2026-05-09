CREATE TABLE daily_performance (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  
  -- From Meta (account level, all campaigns combined)
  total_ad_spend NUMERIC(10,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(10,2) DEFAULT 0,
  cpm NUMERIC(10,2) DEFAULT 0,
  reach INTEGER DEFAULT 0,
  frequency NUMERIC(8,4) DEFAULT 0,
  meta_purchases INTEGER DEFAULT 0,
  meta_purchase_value NUMERIC(10,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);