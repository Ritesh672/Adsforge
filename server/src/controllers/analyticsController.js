const pool = require('../config/db');
const { getDateRange } = require('../utils/dateUtils');

/**
 * GET /api/insights/top-performers
 */
exports.getTopPerformers = async (req, res) => {
  const { by = 'revenue', limit = 10 } = req.query;

  try {
    const range = getDateRange(req.query);

    let query = `
      SELECT 
        p.id as product_id, p.title, p.image_url,
        COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as period_revenue,
        COALESCE(SUM(oli.quantity), 0)::INTEGER as period_units,
        (
          SELECT COALESCE(SUM(oli2.price * oli2.quantity), 0)::FLOAT
          FROM order_line_items oli2
          JOIN orders o2 ON oli2.order_id = o2.id
          WHERE oli2.product_id = p.id 
            AND o2.ordered_at::date >= $2::DATE - ($3::INTEGER || ' days')::INTERVAL
            AND o2.ordered_at::date < $2::DATE
        ) as prev_period_revenue
      FROM products p
      JOIN order_line_items oli ON p.id = oli.product_id
      JOIN orders o ON oli.order_id = o.id
      WHERE o.${range.sqlFilterAlt}
      GROUP BY p.id
    `;

    const sqlParams = [...range.params, range.days];

    if (by === 'revenue') {
      query += ` ORDER BY period_revenue DESC LIMIT $${sqlParams.length + 1}`;
    } else if (by === 'units') {
      query += ` ORDER BY period_units DESC LIMIT $${sqlParams.length + 1}`;
    } else if (by === 'growth') {
      query = `
        SELECT *, 
          CASE WHEN prev_period_revenue > 0 
               THEN ((period_revenue - prev_period_revenue) / prev_period_revenue * 100) 
               ELSE 0 END::FLOAT as metric_value
        FROM (${query}) sub
        ORDER BY metric_value DESC LIMIT $${sqlParams.length + 1}
      `;
    }

    const result = await pool.query(query, [...sqlParams, limit]);
    const data = result.rows.map((row, index) => ({
      rank: index + 1,
      ...row,
      vs_previous_period_pct: row.prev_period_revenue > 0 
        ? ((row.period_revenue - row.prev_period_revenue) / row.prev_period_revenue * 100)
        : 0,
      metric_value: by === 'revenue' ? row.period_revenue : (by === 'units' ? row.period_units : row.metric_value)
    }));

    res.json({
      success: true,
      data,
      meta: { 
        mode: range.mode,
        period: range.period,
        start_date: range.start,
        end_date: range.end,
        days: range.days,
        generated_at: new Date() 
      }
    });
  } catch (error) {
    console.error('Error fetching top performers:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/insights/dead-variants
 */
exports.getDeadVariants = async (req, res) => {
  const { days = 60 } = req.query;

  try {
    const result = await pool.query(`
      SELECT 
        v.id as variant_id, v.shopify_variant_id, v.title as variant_title, v.size, v.color, v.sku,
        p.id as product_id, p.title as product_title, p.image_url as product_image,
        MAX(o.ordered_at) as last_sold_at,
        EXTRACT(DAY FROM NOW() - COALESCE(MAX(o.ordered_at), v.created_at))::INTEGER as days_inactive
      FROM variants v
      JOIN products p ON v.product_id = p.id
      LEFT JOIN order_line_items oli ON v.id = oli.variant_id
      LEFT JOIN orders o ON oli.order_id = o.id
      GROUP BY v.id, p.id
      HAVING MAX(o.ordered_at) IS NULL OR MAX(o.ordered_at) < NOW() - INTERVAL '${days} days'
      ORDER BY days_inactive DESC
    `);

    const data = result.rows.map(row => ({
      ...row,
      recommended_action: row.days_inactive > 120 ? 'discontinue' : (row.days_inactive > 90 ? 'discount' : 'review')
    }));

    res.json({
      success: true,
      data,
      meta: { days, generated_at: new Date() }
    });
  } catch (error) {
    console.error('Error fetching dead variants:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/insights/size-intelligence
 */
exports.getSizeIntelligence = async (req, res) => {
  const { product_id } = req.query;

  try {
    const range = getDateRange(req.query);

    if (!product_id) return res.status(400).json({ success: false, error: 'product_id is required' });

    const productRes = await pool.query(`SELECT title FROM products WHERE id = $1`, [product_id]);
    if (productRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Product not found' });

    const totalRevenueRes = await pool.query(`
      SELECT COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as total
      FROM order_line_items oli
      JOIN orders o ON oli.order_id = o.id
      WHERE oli.product_id = $1 AND o.${range.sqlFilterAlt}
    `, [product_id, ...range.params]);
    const totalRevenue = totalRevenueRes.rows[0].total;

    // Adjust parameter indices for the filter since $1 is product_id
    const sqlFilterAlt = range.sqlFilterAlt.replace(/\$2/g, '$3').replace(/\$1/g, '$2');

    const sizesRes = await pool.query(`
      SELECT 
        v.size,
        COALESCE(SUM(oli.quantity), 0)::INTEGER as total_units,
        COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as total_revenue
      FROM variants v
      LEFT JOIN order_line_items oli ON v.id = oli.variant_id
      LEFT JOIN orders o ON oli.order_id = o.id AND o.${sqlFilterAlt}
      WHERE v.product_id = $1
      GROUP BY v.size
      ORDER BY total_units DESC
    `, [product_id, ...range.params]);

    const sizes = await Promise.all(sizesRes.rows.map(async (row) => {
      const monthlyRes = await pool.query(`
        SELECT 
          to_char(o.ordered_at, 'Mon YYYY') as month,
          SUM(oli.quantity)::INTEGER as units
        FROM order_line_items oli
        JOIN orders o ON oli.order_id = o.id
        WHERE oli.product_id = $1 AND oli.size = $2 AND o.ordered_at >= NOW() - INTERVAL '6 months'
        GROUP BY 1, date_trunc('month', o.ordered_at)
        ORDER BY date_trunc('month', o.ordered_at) DESC
      `, [product_id, row.size]);

      return {
        ...row,
        percentage_of_sales: totalRevenue > 0 ? (row.total_revenue / totalRevenue * 100) : 0,
        monthly_breakdown: monthlyRes.rows
      };
    }));

    res.json({
      success: true,
      data: {
        product_id,
        product_title: productRes.rows[0].title,
        sizes,
        best_selling_size: sizes[0]?.size || null,
        worst_selling_size: sizes[sizes.length - 1]?.size || null
      },
      meta: { 
        mode: range.mode,
        period: range.period,
        start_date: range.start,
        end_date: range.end,
        days: range.days,
        generated_at: new Date() 
      }
    });
  } catch (error) {
    console.error('Error fetching size intelligence:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/insights/returns
 */
exports.getReturns = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    const summaryRes = await pool.query(`
      SELECT 
        COUNT(*)::INTEGER as total_returns,
        COALESCE(SUM(refund_amount), 0)::FLOAT as total_refund_amount,
        COALESCE(AVG(refund_amount), 0)::FLOAT as avg_refund_amount,
        (
          SELECT (COUNT(*)::FLOAT / NULLIF((SELECT COUNT(*) FROM orders WHERE ${range.sqlFilterAlt.replace('$1', '$2').replace('$2', '$3')}), 0)::FLOAT * 100)
          FROM returns WHERE ${range.sqlFilterCreatedAt.replace('$1', '$2').replace('$2', '$3')}
        )::FLOAT as overall_return_rate
      FROM returns
      WHERE ${range.sqlFilterCreatedAt}
    `, range.params);

    const byProductRes = await pool.query(`
      SELECT 
        p.id as product_id, p.title, p.image_url,
        COUNT(DISTINCT o.id)::INTEGER as total_orders,
        COUNT(r.id)::INTEGER as total_returns,
        (COUNT(r.id)::FLOAT / NULLIF(COUNT(DISTINCT o.id), 0)::FLOAT * 100)::FLOAT as return_rate,
        COALESCE(AVG(r.refund_amount), 0)::FLOAT as avg_refund_amount
      FROM products p
      LEFT JOIN order_line_items oli ON p.id = oli.product_id
      LEFT JOIN orders o ON oli.order_id = o.id AND o.${range.sqlFilterAlt}
      LEFT JOIN returns r ON p.id = r.product_id AND r.${range.sqlFilterCreatedAt.replace('$1', '$3').replace('$2', '$4')}
      GROUP BY p.id
      ORDER BY return_rate DESC NULLS LAST
      LIMIT 20
    `, [...range.params, ...range.params]);

    const byReasonRes = await pool.query(`
      SELECT reason, COUNT(*)::INTEGER as count, 
             (COUNT(*)::FLOAT / NULLIF((SELECT COUNT(*) FROM returns WHERE ${range.sqlFilterCreatedAt}), 0)::FLOAT * 100)::FLOAT as percentage
      FROM returns
      WHERE ${range.sqlFilterCreatedAt}
      GROUP BY reason
      ORDER BY count DESC
    `, range.params);

    const byTypeRes = await pool.query(`
      SELECT return_type, COUNT(*)::INTEGER as count,
             (COUNT(*)::FLOAT / NULLIF((SELECT COUNT(*) FROM returns WHERE ${range.sqlFilterCreatedAt}), 0)::FLOAT * 100)::FLOAT as percentage
      FROM returns
      WHERE ${range.sqlFilterCreatedAt}
      GROUP BY return_type
      ORDER BY count DESC
    `, range.params);

    res.json({
      success: true,
      data: {
        summary: summaryRes.rows[0],
        by_product: byProductRes.rows,
        by_reason: byReasonRes.rows,
        by_type: byTypeRes.rows
      },
      meta: { 
        mode: range.mode,
        period: range.period,
        start_date: range.start,
        end_date: range.end,
        days: range.days,
        generated_at: new Date() 
      }
    });
  } catch (error) {
    console.error('Error fetching returns insight:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/portfolio/concentration
 */
exports.getConcentration = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    const totalRevenueRes = await pool.query(`
      SELECT COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as total
      FROM order_line_items oli
      JOIN orders o ON oli.order_id = o.id
      WHERE o.${range.sqlFilterAlt}
    `, range.params);
    const totalRevenue = totalRevenueRes.rows[0].total;

    const productsRes = await pool.query(`
      SELECT 
        p.id as product_id, p.title, p.image_url,
        SUM(oli.price * oli.quantity)::FLOAT as revenue,
        (SUM(oli.price * oli.quantity) / NULLIF($3, 0) * 100)::FLOAT as revenue_percentage
      FROM products p
      JOIN order_line_items oli ON p.id = oli.product_id
      JOIN orders o ON oli.order_id = o.id
      WHERE o.${range.sqlFilterAlt}
      GROUP BY p.id
      ORDER BY revenue DESC
    `, [...range.params, totalRevenue]);

    const data = productsRes.rows.map((row, index) => ({
      rank: index + 1,
      ...row
    }));

    const top5Revenue = data.slice(0, 5).reduce((sum, r) => sum + r.revenue, 0);
    const top10Revenue = data.slice(0, 10).reduce((sum, r) => sum + r.revenue, 0);

    res.json({
      success: true,
      data: {
        total_revenue: totalRevenue,
        top_5_revenue: top5Revenue,
        top_5_percentage: totalRevenue > 0 ? (top5Revenue / totalRevenue * 100) : 0,
        top_10_revenue: top10Revenue,
        top_10_percentage: totalRevenue > 0 ? (top10Revenue / totalRevenue * 100) : 0,
        products: data
      },
      meta: { 
        mode: range.mode,
        period: range.period,
        start_date: range.start,
        end_date: range.end,
        days: range.days,
        generated_at: new Date() 
      }
    });
  } catch (error) {
    console.error('Error fetching concentration:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/portfolio/pareto
 */
exports.getPareto = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    const totalRevenueRes = await pool.query(`
      SELECT COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as total
      FROM order_line_items oli
      JOIN orders o ON oli.order_id = o.id
      WHERE (o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $1 
      AND (o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $2
      AND o.financial_status != 'voided'
    `, [range.start, range.end]);
    const totalRevenue = totalRevenueRes.rows[0].total;

    const result = await pool.query(`
      SELECT 
        p.id as product_id, p.title, 
        SUM(oli.price * oli.quantity)::FLOAT as revenue,
        (SUM(oli.price * oli.quantity) / NULLIF($3, 0) * 100)::FLOAT as revenue_percentage
      FROM products p
      JOIN order_line_items oli ON p.id = oli.product_id
      JOIN orders o ON oli.order_id = o.id
      WHERE (o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $1 
      AND (o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $2
      AND o.financial_status != 'voided'
      GROUP BY p.id, p.title
      ORDER BY revenue DESC
    `, [range.start, range.end, totalRevenue]);

    let cumulativeRevenue = 0;
    let paretoCount = 0;
    const totalProductsCount = result.rows.length;
    const data = result.rows.map((row, index) => {
      cumulativeRevenue += row.revenue;
      const cumulativePercentage = totalRevenue > 0 ? (cumulativeRevenue / totalRevenue * 100) : 0;
      if (cumulativePercentage <= 80) paretoCount++;
      
      return {
        rank: index + 1,
        ...row,
        cumulative_percentage: cumulativePercentage,
        in_top_20_pct: (index + 1) <= (totalProductsCount * 0.2)
      };
    });

    res.json({
      success: true,
      data: {
        total_revenue: totalRevenue,
        pareto_threshold_product_count: paretoCount,
        products: data
      },
      meta: { 
        mode: range.mode,
        period: range.period,
        start_date: range.start,
        end_date: range.end,
        days: range.days,
        generated_at: new Date() 
      }
    });
  } catch (error) {
    console.error('Error fetching pareto:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/portfolio/bought-together
 */
exports.getBoughtTogether = async (req, res) => {
  const { product_id, limit = 10 } = req.query;

  try {
    if (!product_id) return res.status(400).json({ success: false, error: 'product_id is required' });

    const result = await pool.query(`
      SELECT 
        p.id as product_id, p.title, p.image_url,
        COUNT(DISTINCT oli2.order_id)::INTEGER as times_bought_together,
        SUM(o.total_price)::FLOAT as bundle_revenue
      FROM order_line_items oli1
      JOIN order_line_items oli2 ON oli1.order_id = oli2.order_id AND oli1.product_id != oli2.product_id
      JOIN products p ON oli2.product_id = p.id
      JOIN orders o ON oli1.order_id = o.id
      WHERE oli1.product_id = $1
      GROUP BY p.id
      ORDER BY times_bought_together DESC
      LIMIT $2
    `, [product_id, limit]);

    res.json({
      success: true,
      data: result.rows,
      meta: { generated_at: new Date() }
    });
  } catch (error) {
    console.error('Error fetching bought together:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/portfolio/price-impact
 */
exports.getPriceImpact = async (req, res) => {
  const { product_id } = req.query;

  try {
    if (!product_id) return res.status(400).json({ success: false, error: 'product_id is required' });

    const productRes = await pool.query(`SELECT title FROM products WHERE id = $1`, [product_id]);
    const variantsRes = await pool.query(`SELECT id, title, size, color FROM variants WHERE product_id = $1`, [product_id]);

    const data = await Promise.all(variantsRes.rows.map(async (v) => {
      const historyRes = await pool.query(`
        SELECT 
          ph.price as new_price, 
          ph.recorded_at as changed_at,
          LAG(ph.price) OVER (ORDER BY ph.recorded_at) as old_price
        FROM price_history ph
        WHERE ph.variant_id = $1
        ORDER BY ph.recorded_at DESC
      `, [v.id]);

      const priceChanges = await Promise.all(historyRes.rows.filter(r => r.old_price !== null).map(async (ph) => {
        const statsBefore = await pool.query(`
          SELECT 
            COALESCE(SUM(quantity), 0)::INTEGER as units,
            COALESCE(SUM(price * quantity), 0)::FLOAT as revenue
          FROM order_line_items oli
          JOIN orders o ON oli.order_id = o.id
          WHERE oli.variant_id = $1 
            AND o.ordered_at >= $2::TIMESTAMPTZ - INTERVAL '30 days'
            AND o.ordered_at < $2::TIMESTAMPTZ
        `, [v.id, ph.changed_at]);

        const statsAfter = await pool.query(`
          SELECT 
            COALESCE(SUM(quantity), 0)::INTEGER as units,
            COALESCE(SUM(price * quantity), 0)::FLOAT as revenue
          FROM order_line_items oli
          JOIN orders o ON oli.order_id = o.id
          WHERE oli.variant_id = $1 
            AND o.ordered_at >= $2::TIMESTAMPTZ
            AND o.ordered_at < $2::TIMESTAMPTZ + INTERVAL '30 days'
        `, [v.id, ph.changed_at]);

        return {
          old_price: ph.old_price,
          new_price: ph.new_price,
          changed_at: ph.changed_at,
          units_30d_before: statsBefore.rows[0].units,
          units_30d_after: statsAfter.rows[0].units,
          revenue_30d_before: statsBefore.rows[0].revenue,
          revenue_30d_after: statsAfter.rows[0].revenue,
          revenue_impact: statsAfter.rows[0].revenue - statsBefore.rows[0].revenue
        };
      }));

      return {
        variant_id: v.id,
        variant_title: v.title,
        size: v.size,
        color: v.color,
        price_changes: priceChanges
      };
    }));

    res.json({
      success: true,
      data: {
        product_id,
        product_title: productRes.rows[0]?.title,
        variants: data
      },
      meta: { product_id, generated_at: new Date() }
    });
  } catch (error) {
    console.error('Error fetching price impact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/analytics/products/overview
 */
exports.getProductOverview = async (req, res) => {
  try {
    const range = getDateRange(req.query);

    // 1. KPI Aggregates
    const kpiRes = await pool.query(`
      SELECT 
        COALESCE(SUM(total_price), 0)::FLOAT as revenue,
        COALESCE(SUM(total_items), 0)::INTEGER as units,
        COUNT(DISTINCT id)::INTEGER as orders,
        (SELECT COUNT(*) FROM products WHERE status = 'active')::INTEGER as active_products,
        (
          SELECT (COUNT(*)::FLOAT / NULLIF((SELECT COUNT(*) FROM orders WHERE (ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $1 AND (ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $2), 0)::FLOAT * 100)
          FROM returns WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $1 AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $2
        )::FLOAT as return_rate
      FROM orders
      WHERE (ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $1 AND (ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $2 AND financial_status != 'voided'
    `, [range.start, range.end]);

    // 2. Portfolio Concentration (Top 5 Products Share)
    const concentrationRes = await pool.query(`
      WITH product_revenue AS (
        SELECT 
          oli.product_id,
          SUM(oli.price * oli.quantity) as revenue
        FROM order_line_items oli
        JOIN orders o ON oli.order_id = o.id
        WHERE (o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $1 AND (o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $2
        GROUP BY 1
      ),
      total_revenue AS (
        SELECT SUM(revenue) as total FROM product_revenue
      ),
      top_5_revenue AS (
        SELECT SUM(revenue) as top_total FROM (
          SELECT revenue FROM product_revenue ORDER BY revenue DESC LIMIT 5
        ) t
      )
      SELECT 
        COALESCE((top_total / NULLIF(total, 0) * 100), 0)::FLOAT as concentration_pct
      FROM top_5_revenue, total_revenue
    `, [range.start, range.end]);

    // 3. Daily/Hourly Chart Data
    const isSingleDay = range.days === 1;
    const seriesStep = isSingleDay ? '1 hour' : '1 day';
    const seriesStart = isSingleDay ? `${range.start} 00:00:00` : range.start;
    const seriesEnd = isSingleDay ? `${range.end} 23:59:59` : range.end;

    const chartRes = await pool.query(`
      WITH date_range AS (
        SELECT generate_series($1::TIMESTAMP, $2::TIMESTAMP, $3::INTERVAL) as date
      ),
      daily_sales AS (
        SELECT 
          ${isSingleDay ? "date_trunc('hour', o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')" : "(o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date"} as date,
          SUM(o.total_price) as revenue,
          SUM(o.total_items) as units,
          COUNT(DISTINCT o.id) as orders,
          COUNT(DISTINCT oli.product_id) as active_products
        FROM orders o
        LEFT JOIN order_line_items oli ON o.id = oli.order_id
        WHERE o.financial_status != 'voided'
        AND o.ordered_at >= $1 AND o.ordered_at <= $2
        GROUP BY 1
      ),
      daily_returns AS (
        SELECT 
          ${isSingleDay ? "date_trunc('hour', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')" : "(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date"} as date,
          COUNT(*) as return_count
        FROM returns
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY 1
      )
      SELECT 
        dr.date,
        COALESCE(ds.revenue, 0)::FLOAT as revenue,
        COALESCE(ds.units, 0)::INTEGER as units,
        COALESCE(ds.orders, 0)::INTEGER as orders,
        COALESCE(dret.return_count, 0)::INTEGER as returns,
        CASE WHEN COALESCE(ds.units, 0) > 0 THEN (COALESCE(dret.return_count, 0)::FLOAT / ds.units) * 100 ELSE 0 END as return_rate,
        COALESCE(ds.active_products, 0)::INTEGER as active_products,
        CASE WHEN COALESCE(ds.orders, 0) > 0 THEN ds.revenue / ds.orders ELSE 0 END as aov
      FROM date_range dr
      LEFT JOIN daily_sales ds ON ds.date = dr.date
      LEFT JOIN daily_returns dret ON dret.date = dr.date
      ORDER BY dr.date ASC
    `, [seriesStart, seriesEnd, seriesStep]);

    // 4. Category Breakdown
    const categoryRes = await pool.query(`
      SELECT 
        COALESCE(NULLIF(p.product_type, ''), 'Uncategorized') as category,
        SUM(oli.price * oli.quantity)::FLOAT as revenue,
        COUNT(DISTINCT oli.order_id)::INTEGER as orders
      FROM order_line_items oli
      JOIN orders o ON oli.order_id = o.id
      LEFT JOIN products p ON oli.product_id = p.id
      WHERE (o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $1 AND (o.ordered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $2
      GROUP BY 1
      ORDER BY revenue DESC
      LIMIT 5
    `, [range.start, range.end]);

    // 5. Top 10 Variants (Top performers for the period)
    const variantsRes = await pool.query(`
      SELECT 
        v.id as variant_id, v.title as variant_title, v.sku, v.size,
        p.id as product_id, p.title as product_title, p.image_url as product_image,
        SUM(oli.price * oli.quantity)::FLOAT as revenue,
        SUM(oli.quantity)::INTEGER as units
      FROM variants v
      JOIN products p ON v.product_id = p.id
      JOIN order_line_items oli ON v.id = oli.variant_id
      JOIN orders o ON oli.order_id = o.id
      WHERE o.${range.sqlFilterAlt}
      GROUP BY v.id, p.id
      ORDER BY revenue DESC
      LIMIT 10
    `, range.params);

    // 6. Dead Variants (No sales in 60 days)
    const deadRes = await pool.query(`
      SELECT 
        v.id as variant_id, v.title as variant_title, v.sku,
        p.id as product_id, p.title as product_title, p.image_url as product_image,
        MAX(o.ordered_at) as last_sold_at,
        EXTRACT(DAY FROM NOW() - COALESCE(MAX(o.ordered_at), v.created_at))::INTEGER as days_inactive
      FROM variants v
      JOIN products p ON v.product_id = p.id
      LEFT JOIN order_line_items oli ON v.id = oli.variant_id
      LEFT JOIN orders o ON oli.order_id = o.id
      GROUP BY v.id, p.id
      HAVING MAX(o.ordered_at) IS NULL OR MAX(o.ordered_at) < NOW() - INTERVAL '60 days'
      ORDER BY days_inactive DESC
      LIMIT 10
    `);

    // 5. Dead Stock % (Variants not sold in 90 days)
    const deadStockRes = await pool.query(`
      WITH total_variants AS (SELECT COUNT(*) as count FROM variants),
      dead_variants AS (
        SELECT COUNT(*) as count 
        FROM variants v
        LEFT JOIN order_line_items oli ON v.id = oli.variant_id
        LEFT JOIN orders o ON oli.order_id = o.id AND o.ordered_at > NOW() - INTERVAL '90 days'
        WHERE o.id IS NULL
      )
      SELECT (dv.count::FLOAT / NULLIF(tv.count, 0)::FLOAT * 100)::FLOAT as dead_stock_pct
      FROM dead_variants dv, total_variants tv
    `);

    const kpi = kpiRes.rows[0];
    res.json({
      success: true,
      data: {
        kpis: {
          revenue: kpi.revenue,
          units: kpi.units,
          active_products: kpi.active_products,
          return_rate: kpi.return_rate,
          dead_stock_pct: deadStockRes.rows[0]?.dead_stock_pct || 0,
          concentration_pct: concentrationRes.rows[0]?.concentration_pct || 0
        },
        chart: chartRes.rows,
        categories: categoryRes.rows,
        top_variants: variantsRes.rows,
        dead_variants: deadRes.rows.map(row => ({
          ...row,
          recommended_action: row.days_inactive > 120 ? 'discontinue' : (row.days_inactive > 90 ? 'discount' : 'review')
        }))
      }
    });
  } catch (error) {
    console.error('Error in getProductOverview:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
