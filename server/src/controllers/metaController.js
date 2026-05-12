const pool = require('../config/db');
const { getDateRange } = require('../utils/dateUtils');
const { runMetaBackfill } = require('../jobs/metaBackfill');

/**
 * Helper to validate dates
 */
const validateDates = (start, end) => {
  if (new Date(start) > new Date(end)) {
    return 'start_date must be before end_date';
  }
  const diffDays = (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24);
  if (diffDays > 730) {
    return 'Date range cannot exceed 2 years';
  }
  return null;
};

/**
 * GET /api/meta/overview
 */
exports.getOverview = async (req, res) => {
  try {
    const range = getDateRange(req.query);
    const dateError = validateDates(range.start, range.end);
    if (dateError) return res.status(400).json({ success: false, error: dateError });
    const rangeStart = new Date(`${range.start}T00:00:00`);
    const prevEndDate = new Date(rangeStart);
    prevEndDate.setDate(prevEndDate.getDate() - 1);

    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - (range.days - 1));

    const prevStart = prevStartDate.toISOString().split('T')[0];
    const prevEnd = prevEndDate.toISOString().split('T')[0];

    // 1. Get Meta Metrics
    const metaRes = await pool.query(`
      SELECT
        COUNT(*) as days,
        COALESCE(SUM(total_ad_spend), 0)::FLOAT as total_spend,
        COALESCE(SUM(impressions), 0)::INTEGER as total_impressions,
        COALESCE(SUM(clicks), 0)::INTEGER as total_clicks,
        COALESCE(SUM(reach), 0)::INTEGER as total_reach,
        COALESCE(SUM(meta_purchases), 0)::INTEGER as total_meta_purchases,
        COALESCE(SUM(meta_purchase_value), 0)::FLOAT as total_meta_purchase_value,
        ROUND(AVG(ctr)::numeric, 4)::FLOAT as avg_ctr,
        ROUND(AVG(cpc)::numeric, 2)::FLOAT as avg_cpc,
        ROUND(AVG(cpm)::numeric, 2)::FLOAT as avg_cpm,
        ROUND(AVG(frequency)::numeric, 2)::FLOAT as avg_frequency,
        ROUND((SUM(total_ad_spend) / NULLIF(COUNT(*), 0))::numeric, 2)::FLOAT as avg_daily_spend,
        COALESCE(SUM(meta_add_to_cart), 0)::INTEGER as total_meta_add_to_cart,
        COALESCE(SUM(meta_initiate_checkout), 0)::INTEGER as total_meta_initiate_checkout
      FROM daily_performance
      WHERE date >= $1 AND date <= $2
    `, [range.start, range.end]);

    const prevMetaRes = await pool.query(`
      SELECT
        COUNT(*) as days,
        COALESCE(SUM(total_ad_spend), 0)::FLOAT as total_spend,
        COALESCE(SUM(impressions), 0)::INTEGER as total_impressions,
        COALESCE(SUM(clicks), 0)::INTEGER as total_clicks,
        COALESCE(SUM(reach), 0)::INTEGER as total_reach,
        COALESCE(SUM(meta_purchases), 0)::INTEGER as total_meta_purchases,
        ROUND(AVG(ctr)::numeric, 4)::FLOAT as avg_ctr,
        ROUND(AVG(cpc)::numeric, 2)::FLOAT as avg_cpc,
        ROUND(AVG(frequency)::numeric, 2)::FLOAT as avg_frequency,
        COALESCE(SUM(meta_add_to_cart), 0)::INTEGER as total_meta_add_to_cart,
        COALESCE(SUM(meta_initiate_checkout), 0)::INTEGER as total_meta_initiate_checkout
      FROM daily_performance
      WHERE date >= $1 AND date <= $2
    `, [prevStart, prevEnd]);

    // 2. Get Shopify Ground Truth Metrics
    const shopifyRes = await pool.query(`
      SELECT
        COALESCE(SUM(total_price) FILTER (WHERE financial_status != 'voided'), 0)::FLOAT as shopify_revenue,
        (COUNT(*) FILTER (WHERE financial_status != 'voided'))::INTEGER as shopify_orders,
        COALESCE(SUM(total_items) FILTER (WHERE financial_status != 'voided'), 0)::INTEGER as shopify_units,
        (COUNT(*) FILTER (WHERE financial_status = 'voided'))::INTEGER as cancelled_orders
      FROM orders
      WHERE (ordered_at AT TIME ZONE 'Asia/Kolkata')::date >= $1 
      AND (ordered_at AT TIME ZONE 'Asia/Kolkata')::date <= $2
    `, [range.start, range.end]);

    const prevShopifyRes = await pool.query(`
      SELECT
        COALESCE(SUM(total_price) FILTER (WHERE financial_status != 'voided'), 0)::FLOAT as shopify_revenue,
        (COUNT(*) FILTER (WHERE financial_status != 'voided'))::INTEGER as shopify_orders,
        COALESCE(SUM(total_items) FILTER (WHERE financial_status != 'voided'), 0)::INTEGER as shopify_units,
        (COUNT(*) FILTER (WHERE financial_status = 'voided'))::INTEGER as cancelled_orders
      FROM orders
      WHERE (ordered_at AT TIME ZONE 'Asia/Kolkata')::date >= $1 
      AND (ordered_at AT TIME ZONE 'Asia/Kolkata')::date <= $2
    `, [prevStart, prevEnd]);

    const m = metaRes.rows[0];
    const s = shopifyRes.rows[0];
    const pm = prevMetaRes.rows[0];
    const ps = prevShopifyRes.rows[0];

    // 3. Calculate Derived Metrics
    const real_roas = m.total_spend > 0 ? (s.shopify_revenue / m.total_spend) : null;
    const cost_per_order = s.shopify_orders > 0 ? (m.total_spend / s.shopify_orders) : null;
    const avg_order_value = s.shopify_orders > 0 ? (s.shopify_revenue / s.shopify_orders) : null;
    const prev_real_roas = pm.total_spend > 0 ? (ps.shopify_revenue / pm.total_spend) : null;
    const prev_cost_per_order = ps.shopify_orders > 0 ? (pm.total_spend / ps.shopify_orders) : null;
    const prev_avg_order_value = ps.shopify_orders > 0 ? (ps.shopify_revenue / ps.shopify_orders) : null;
    const percentChange = (current, previous) => (
      Number(previous) > 0 ? ((Number(current || 0) - Number(previous)) / Number(previous) * 100) : null
    );

    res.json({
      success: true,
      data: {
        total_spend: m.total_spend,
        avg_daily_spend: m.avg_daily_spend,
        total_impressions: m.total_impressions,
        total_clicks: m.total_clicks,
        total_landing_page_views: m.total_clicks,
        total_reach: m.total_reach,
        avg_ctr: m.avg_ctr,
        avg_cpc: m.avg_cpc,
        avg_cpm: m.avg_cpm,
        avg_frequency: m.avg_frequency,
        meta_purchases: m.total_meta_purchases,
        meta_add_to_cart: m.total_meta_add_to_cart,
        meta_initiate_checkout: m.total_meta_initiate_checkout,
        shopify_revenue: s.shopify_revenue,
        shopify_orders: s.shopify_orders,
        shopify_units: s.shopify_units,
        cancelled_orders: s.cancelled_orders,
        cancel_rate: (Number(s.shopify_orders || 0) + Number(s.cancelled_orders || 0)) > 0
          ? (Number(s.cancelled_orders || 0) / (Number(s.shopify_orders || 0) + Number(s.cancelled_orders || 0)) * 100)
          : 0,
        real_roas,
        cost_per_order,
        avg_order_value,
        mer: real_roas,
        changes: {
          total_spend: percentChange(m.total_spend, pm.total_spend),
          total_impressions: percentChange(m.total_impressions, pm.total_impressions),
          total_clicks: percentChange(m.total_clicks, pm.total_clicks),
          total_landing_page_views: percentChange(m.total_clicks, pm.total_clicks),
          total_reach: percentChange(m.total_reach, pm.total_reach),
          avg_ctr: percentChange(m.avg_ctr, pm.avg_ctr),
          avg_cpc: percentChange(m.avg_cpc, pm.avg_cpc),
          avg_frequency: percentChange(m.avg_frequency, pm.avg_frequency),
          meta_purchases: percentChange(m.total_meta_purchases, pm.total_meta_purchases),
          meta_add_to_cart: percentChange(m.total_meta_add_to_cart, pm.total_meta_add_to_cart),
          meta_initiate_checkout: percentChange(m.total_meta_initiate_checkout, pm.total_meta_initiate_checkout),
          shopify_revenue: percentChange(s.shopify_revenue, ps.shopify_revenue),
          shopify_orders: percentChange(s.shopify_orders, ps.shopify_orders),
          shopify_units: percentChange(s.shopify_units, ps.shopify_units),
          cancelled_orders: percentChange(s.cancelled_orders, ps.cancelled_orders),
          real_roas: percentChange(real_roas, prev_real_roas),
          cost_per_order: percentChange(cost_per_order, prev_cost_per_order),
          avg_order_value: percentChange(avg_order_value, prev_avg_order_value)
        }
      },
      meta: {
        start_date: range.start,
        end_date: range.end,
        days: m.days,
        generated_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching meta overview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/meta/daily
 */
exports.getDailyData = async (req, res) => {
  try {
    const range = getDateRange(req.query);
    const dateError = validateDates(range.start, range.end);
    if (dateError) return res.status(400).json({ success: false, error: dateError });

    const isSingleDay = range.start === range.end;

    let query;
    let params = [range.start, range.end];

    if (isSingleDay) {
      // Hourly view for single day
      query = `
        WITH hourly_buckets AS (
          SELECT generate_series(0, 23) AS hour
        ),
        hourly_shopify AS (
          SELECT
            DATE_PART('hour', ordered_at AT TIME ZONE 'Asia/Kolkata') as hour,
            SUM(total_price) FILTER (WHERE financial_status != 'voided') as revenue,
            COUNT(*) FILTER (WHERE financial_status != 'voided') as orders,
            SUM(total_items) FILTER (WHERE financial_status != 'voided') as units,
            COUNT(*) FILTER (WHERE financial_status = 'voided') as cancelled_orders
          FROM orders
          WHERE (ordered_at AT TIME ZONE 'Asia/Kolkata')::date = $1
          GROUP BY 1
        ),
        daily_meta AS (
          SELECT total_ad_spend, impressions, clicks, ctr, cpc, cpm, reach, frequency, meta_purchases, meta_add_to_cart, meta_initiate_checkout
          FROM daily_performance
          WHERE date = $1
          LIMIT 1
        )
        SELECT
          ($1::DATE + (hb.hour || ' hours')::INTERVAL) as date,
          hb.hour,
          LPAD(hb.hour::TEXT, 2, '0') || ':00' as hour_label,
          (COALESCE(dm.total_ad_spend, 0) / 24.0)::FLOAT as spend,
          COALESCE(hs.revenue, 0)::FLOAT as revenue,
          COALESCE(hs.orders, 0)::INTEGER as orders,
          COALESCE(hs.units, 0)::INTEGER as units,
          COALESCE(hs.cancelled_orders, 0)::INTEGER as cancelled_orders,
          COALESCE(dm.impressions, 0)::INTEGER as impressions,
          COALESCE(dm.clicks, 0)::INTEGER as clicks,
          COALESCE(dm.clicks, 0)::INTEGER as landing_page_views,
          COALESCE(dm.reach, 0)::INTEGER as reach,
          COALESCE(dm.ctr, 0)::FLOAT as ctr,
          COALESCE(dm.cpc, 0)::FLOAT as cpc,
          COALESCE(dm.cpm, 0)::FLOAT as cpm,
          COALESCE(dm.frequency, 0)::FLOAT as frequency,
          COALESCE(dm.meta_purchases, 0)::INTEGER as meta_purchases,
          COALESCE(dm.meta_add_to_cart, 0)::INTEGER as meta_add_to_cart,
          COALESCE(dm.meta_initiate_checkout, 0)::INTEGER as meta_initiate_checkout,
          CASE WHEN hs.orders > 0 THEN hs.revenue / hs.orders ELSE 0 END as aov,
          CASE
            WHEN (COALESCE(dm.total_ad_spend, 0) / 24.0) > 0
            THEN ROUND((COALESCE(hs.revenue, 0) / (dm.total_ad_spend / 24.0))::numeric, 2)::FLOAT
            ELSE NULL
          END as real_roas
        FROM hourly_buckets hb
        LEFT JOIN hourly_shopify hs ON hb.hour = hs.hour
        LEFT JOIN daily_meta dm ON true
        ORDER BY hb.hour ASC
      `;
      params = [range.start];
    } else {
      // Daily view (Optimized to never hide days)
      query = `
        WITH date_range AS (
          SELECT generate_series($1::DATE, $2::DATE, '1 day'::interval)::DATE as date
        ),
        daily_meta AS (
          SELECT date, total_ad_spend, impressions, clicks, ctr, cpc, cpm, reach, frequency, meta_purchases, meta_add_to_cart, meta_initiate_checkout
          FROM daily_performance
          WHERE date >= $1 AND date <= $2
        ),
        daily_shopify AS (
          SELECT
            (ordered_at AT TIME ZONE 'Asia/Kolkata')::date as date,
            SUM(total_price) FILTER (WHERE financial_status != 'voided') as shopify_revenue,
            COUNT(*) FILTER (WHERE financial_status != 'voided') as shopify_orders,
            SUM(total_items) FILTER (WHERE financial_status != 'voided') as shopify_units,
            AVG(total_price) FILTER (WHERE financial_status != 'voided') as avg_order_value,
            COUNT(*) FILTER (WHERE financial_status = 'voided') as cancelled_orders
          FROM orders
          WHERE (ordered_at AT TIME ZONE 'Asia/Kolkata')::date >= $1 AND (ordered_at AT TIME ZONE 'Asia/Kolkata')::date <= $2
          GROUP BY 1
        )
        SELECT
          dr.date,
          COALESCE(dm.total_ad_spend, 0)::FLOAT as spend,
          COALESCE(dm.impressions, 0)::INTEGER as impressions,
          COALESCE(dm.clicks, 0)::INTEGER as clicks,
          COALESCE(dm.clicks, 0)::INTEGER as landing_page_views,
          COALESCE(dm.ctr, 0)::FLOAT as ctr,
          COALESCE(dm.cpc, 0)::FLOAT as cpc,
          COALESCE(dm.cpm, 0)::FLOAT as cpm,
          COALESCE(dm.reach, 0)::INTEGER as reach,
          COALESCE(dm.frequency, 0)::FLOAT as frequency,
          COALESCE(dm.meta_purchases, 0)::INTEGER as meta_purchases,
          COALESCE(dm.meta_add_to_cart, 0)::INTEGER as meta_add_to_cart,
          COALESCE(dm.meta_initiate_checkout, 0)::INTEGER as meta_initiate_checkout,
          COALESCE(ds.shopify_revenue, 0)::FLOAT as revenue,
          COALESCE(ds.shopify_orders, 0)::INTEGER as orders,
          COALESCE(ds.shopify_units, 0)::INTEGER as units,
          COALESCE(ds.cancelled_orders, 0)::INTEGER as cancelled_orders,
          COALESCE(ds.avg_order_value, 0)::FLOAT as aov,
          CASE
            WHEN COALESCE(dm.total_ad_spend, 0) > 0
            THEN ROUND((COALESCE(ds.shopify_revenue, 0) / dm.total_ad_spend)::numeric, 2)::FLOAT
            ELSE NULL
          END as real_roas,
          CASE
            WHEN COALESCE(ds.shopify_orders, 0) > 0
            THEN ROUND((COALESCE(dm.total_ad_spend, 0) / ds.shopify_orders)::numeric, 2)::FLOAT
            ELSE NULL
          END as cost_per_order
        FROM date_range dr
        LEFT JOIN daily_meta dm ON dm.date = dr.date
        LEFT JOIN daily_shopify ds ON ds.date = dr.date
        ORDER BY dr.date ASC
      `;
    }

    const result = await pool.query(query, params);
    const daily = result.rows;
    
    // Summary
    const totalSpend = daily.reduce((sum, r) => sum + Number(r.spend || 0), 0);
    const totalRevenue = daily.reduce((sum, r) => sum + Number(r.revenue || 0), 0);
    const totalOrders = daily.reduce((sum, r) => sum + Number(r.orders || 0), 0);
    
    res.json({
      success: true,
      data: {
        daily,
        is_hourly: isSingleDay,
        summary: {
          total_spend: totalSpend,
          total_revenue: totalRevenue,
          total_orders: totalOrders,
          overall_roas: totalSpend > 0 ? (totalRevenue / totalSpend) : null
        }
      },
      meta: {
        start_date: range.start,
        end_date: range.end,
        generated_at: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching meta daily data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/meta/sync
 */
exports.triggerMetaSync = async (req, res) => {
  try {
    runMetaBackfill().catch(err => console.error('Background Meta Sync Error:', err));
    res.status(202).json({ success: true, message: 'Meta sync started' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/meta/sync/status
 */
exports.getMetaSyncStatus = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM sync_logs WHERE sync_type = 'meta_backfill' ORDER BY started_at DESC LIMIT 5"
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
