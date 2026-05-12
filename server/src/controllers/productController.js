const pool = require('../config/db');
const { getDateRange } = require('../utils/dateUtils');

/**
 * GET /api/products
 */
exports.getAllProducts = async (req, res) => {
  const { status, sort = 'revenue', search, limit = 50 } = req.query;

  try {
    const range = getDateRange(req.query);
    const rangeStart = new Date(`${range.start}T00:00:00`);
    const prevEndDate = new Date(rangeStart);
    prevEndDate.setDate(prevEndDate.getDate() - 1);

    const prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - (range.days - 1));

    const prevStart = prevStartDate.toISOString().split('T')[0];
    const prevEnd = prevEndDate.toISOString().split('T')[0];

    let query = `
      WITH current_sales AS (
        SELECT
          oli.product_id,
          COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as total_revenue,
          COALESCE(SUM(oli.quantity), 0)::INTEGER as total_units,
          COUNT(DISTINCT o.id)::INTEGER as order_count
        FROM order_line_items oli
        JOIN orders o ON oli.order_id = o.id
        WHERE o.ordered_at AT TIME ZONE 'Asia/Kolkata' >= $1::DATE
          AND o.ordered_at AT TIME ZONE 'Asia/Kolkata' < ($2::DATE + INTERVAL '1 day')
          AND o.financial_status != 'voided'
        GROUP BY oli.product_id
      ),
      previous_sales AS (
        SELECT
          oli.product_id,
          COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as prev_revenue
        FROM order_line_items oli
        JOIN orders o ON oli.order_id = o.id
        WHERE o.ordered_at AT TIME ZONE 'Asia/Kolkata' >= $3::DATE
          AND o.ordered_at AT TIME ZONE 'Asia/Kolkata' < ($4::DATE + INTERVAL '1 day')
          AND o.financial_status != 'voided'
        GROUP BY oli.product_id
      ),
      returns_by_product AS (
        SELECT product_id, COUNT(*)::INTEGER as return_count
        FROM returns
        WHERE created_at AT TIME ZONE 'Asia/Kolkata' >= $1::DATE
          AND created_at AT TIME ZONE 'Asia/Kolkata' < ($2::DATE + INTERVAL '1 day')
        GROUP BY product_id
      )
      SELECT 
        p.id, p.shopify_product_id, p.title, p.vendor, p.product_type, p.tags, p.status, p.image_url,
        COALESCE(cs.total_revenue, 0)::FLOAT as total_revenue,
        COALESCE(cs.total_units, 0)::INTEGER as total_units,
        COALESCE(cs.order_count, 0)::INTEGER as order_count,
        COALESCE(r.return_count, 0)::INTEGER as return_count,
        CASE WHEN COALESCE(cs.order_count, 0) > 0 
             THEN (COALESCE(r.return_count, 0)::FLOAT / cs.order_count::FLOAT * 100)
             ELSE 0 END::FLOAT as return_rate,
        CASE WHEN COALESCE(cs.order_count, 0) > 0 
             THEN (COALESCE(cs.total_revenue, 0)::FLOAT / cs.order_count::FLOAT)
             ELSE 0 END::FLOAT as avg_order_value,
        CASE WHEN COALESCE(ps.prev_revenue, 0) > 0
             THEN ((COALESCE(cs.total_revenue, 0) - ps.prev_revenue) / ps.prev_revenue * 100)
             ELSE 0 END::FLOAT as mom_revenue_change_pct
      FROM products p
      LEFT JOIN current_sales cs ON p.id = cs.product_id
      LEFT JOIN previous_sales ps ON p.id = ps.product_id
      LEFT JOIN returns_by_product r ON p.id = r.product_id
      WHERE 1=1
    `;

    const sqlParams = [...range.params, prevStart, prevEnd];
    if (search) {
      sqlParams.push(`%${search}%`);
      query += ` AND p.title ILIKE $${sqlParams.length}`;
    }
    if (status) {
      sqlParams.push(status);
      query += ` AND p.status = $${sqlParams.length}`;
    }

    // Sort
    switch (sort) {
      case 'revenue': query += ` ORDER BY total_revenue DESC`; break;
      case 'units': query += ` ORDER BY total_units DESC`; break;
      case 'returns': query += ` ORDER BY return_count DESC`; break;
      case 'name': query += ` ORDER BY p.title ASC`; break;
      default: query += ` ORDER BY total_revenue DESC`;
    }

    // Add LIMIT clause
    sqlParams.push(Math.min(parseInt(limit, 10) || 50, 200));
    query += ` LIMIT $${sqlParams.length}`;

    const result = await pool.query(query, sqlParams);
    const products = result.rows;

    res.json({
      success: true,
      data: products,
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
    console.error('Error fetching products:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/products/:id
 */
exports.getProductById = async (req, res) => {
  const { id } = req.params;

  try {
    const range = getDateRange(req.query);

    // Current period stats
    const productRes = await pool.query(`SELECT * FROM products WHERE id = $1`, [id]);
    if (productRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Product not found' });
    const product = productRes.rows[0];

    // Fix parameter indices for subqueries where $1 is the product ID
    const filterCreatedAt = range.sqlFilterCreatedAt.replace(/\$2/g, '$3').replace(/\$1/g, '$2');
    const filterAlt = range.sqlFilterAlt.replace(/\$2/g, '$3').replace(/\$1/g, '$2');

    const statsRes = await pool.query(`
      SELECT 
        COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as total_revenue,
        COALESCE(SUM(oli.quantity), 0)::INTEGER as total_units,
        COALESCE(COUNT(DISTINCT o.id), 0)::INTEGER as order_count,
        (SELECT COUNT(*) FROM returns WHERE product_id = $1 AND ${filterCreatedAt})::INTEGER as return_count
      FROM order_line_items oli
      JOIN orders o ON oli.order_id = o.id
      WHERE oli.product_id = $1 AND o.${filterAlt}
    `, [id, ...range.params]);

    // Previous period stats for MOM
    let prevStart, prevEnd;
    if (range.mode === 'custom') {
      const daysDiff = range.days;
      const startObj = new Date(range.start);
      prevEnd = new Date(startObj);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStartObj = new Date(prevEnd);
      prevStartObj.setDate(prevStartObj.getDate() - (daysDiff - 1));
      prevStart = prevStartObj.toISOString().split('T')[0];
      prevEnd = prevEnd.toISOString().split('T')[0];
    } else {
      const endObj = new Date(range.start);
      prevEnd = new Date(endObj);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStartObj = new Date(prevEnd);
      if (range.period === '7d') prevStartObj.setDate(prevStartObj.getDate() - 7);
      else if (range.period === '90d') prevStartObj.setDate(prevStartObj.getDate() - 90);
      else if (range.period === '1y') prevStartObj.setFullYear(prevStartObj.getFullYear() - 1);
      else prevStartObj.setDate(prevStartObj.getDate() - 30);
      prevStart = prevStartObj.toISOString().split('T')[0];
      prevEnd = prevEnd.toISOString().split('T')[0];
    }

    const prevStatsRes = await pool.query(`
      SELECT 
        COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as prev_revenue
      FROM order_line_items oli
      JOIN orders o ON oli.order_id = o.id
      WHERE oli.product_id = $1 
        AND o.ordered_at::date >= $2 AND o.ordered_at::date <= $3
    `, [id, prevStart, prevEnd]);

    const stats = statsRes.rows[0];
    const prevRevenue = prevStatsRes.rows[0]?.prev_revenue || 0;
    stats.mom_revenue_change_pct = prevRevenue > 0 
      ? ((stats.total_revenue - prevRevenue) / prevRevenue * 100) 
      : 0;

    const variantsFilterAlt = range.sqlFilterAlt.replace(/\$2/g, '$3').replace(/\$1/g, '$2');
    const variantsRes = await pool.query(`
      SELECT 
        v.*,
        COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as total_revenue,
        COALESCE(SUM(oli.quantity), 0)::INTEGER as total_units
      FROM variants v
      LEFT JOIN order_line_items oli ON v.id = oli.variant_id
      LEFT JOIN orders o ON oli.order_id = o.id AND o.${variantsFilterAlt}
      WHERE v.product_id = $1
      GROUP BY v.id
    `, [id, ...range.params]);

    res.json({
      success: true,
      data: {
        ...product,
        stats,
        variants: variantsRes.rows
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
    console.error('Error fetching product by ID:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/products/:id/sales
 */
exports.getProductSales = async (req, res) => {
  const { id } = req.params;

  try {
    const range = getDateRange(req.query);

    const result = await pool.query(`
      WITH date_range AS (
        SELECT generate_series($1::DATE, $2::DATE, '1 day'::interval)::DATE as date
      )
      SELECT 
        dr.date,
        COALESCE(SUM(oli.quantity), 0)::INTEGER as units_sold,
        COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as revenue,
        COALESCE(COUNT(DISTINCT o.id), 0)::INTEGER as orders
      FROM date_range dr
      LEFT JOIN orders o ON o.ordered_at::DATE = dr.date
      LEFT JOIN order_line_items oli ON oli.order_id = o.id AND oli.product_id = $3
      GROUP BY dr.date
      ORDER BY dr.date ASC
    `, [range.start, range.end, id]);

    res.json({
      success: true,
      data: result.rows,
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
    console.error('Error fetching product sales:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/products/:id/revenue
 */
exports.getProductRevenue = async (req, res) => {
  const { id } = req.params;

  try {
    const range = getDateRange(req.query);

    const result = await pool.query(`
      WITH date_range AS (
        SELECT generate_series($1::DATE, $2::DATE, '1 day'::interval)::DATE as date
      )
      SELECT 
        dr.date,
        COALESCE(SUM(oli.price * oli.quantity), 0)::FLOAT as revenue,
        COALESCE(SUM(oli.quantity), 0)::INTEGER as units_sold,
        CASE WHEN SUM(oli.quantity) > 0 
             THEN (SUM(oli.price * oli.quantity) / SUM(oli.quantity))
             ELSE 0 END::FLOAT as avg_price
      FROM date_range dr
      LEFT JOIN orders o ON o.ordered_at::DATE = dr.date
      LEFT JOIN order_line_items oli ON oli.order_id = o.id AND oli.product_id = $3
      GROUP BY dr.date
      ORDER BY dr.date ASC
    `, [range.start, range.end, id]);

    res.json({
      success: true,
      data: result.rows,
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
    console.error('Error fetching product revenue:', error);
    res.status(error.message.includes('date') ? 400 : 500).json({ success: false, error: error.message });
  }
};
