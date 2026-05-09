/**
 * Shared utility for date range calculations and validation
 */

exports.getDateRange = (query) => {
  // Validate custom date range format if provided
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  
  if (query.start_date || query.end_date) {
    if (!dateRegex.test(query.start_date) || !dateRegex.test(query.end_date)) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    const start = new Date(query.start_date);
    const end = new Date(query.end_date);

    if (start > end) {
      throw new Error('start_date must be before end_date');
    }

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 730) { // 2 years
      throw new Error('Date range cannot exceed 2 years');
    }

    return {
      mode: 'custom',
      start: query.start_date,
      end: query.end_date,
      days: diffDays + 1,
      sqlFilter: `date >= $1 AND date <= $2`,
      sqlFilterAlt: `ordered_at::date >= $1 AND ordered_at::date <= $2`, // for tables that use ordered_at
      sqlFilterCreatedAt: `created_at::date >= $1 AND created_at::date <= $2`, // for tables that use created_at
      params: [query.start_date, query.end_date]
    };
  }

  // Fallback to period
  const periodMap = {
    'today': '0 days',
    'yesterday': '1 day',
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    '1y': '1 year'
  };
  const interval = periodMap[query.period] || '30 days';
  
  // Calculate start/end for period mode to include in meta
  const today = new Date();
  const offset = 5.5 * 60 * 60 * 1000; // IST Offset
  const localToday = new Date(today.getTime() + offset);
  
  let start, end;
  const startObj = new Date(localToday);
  const endObj = new Date(localToday);

  if (query.period === 'today') {
    start = localToday.toISOString().split('T')[0];
    end = localToday.toISOString().split('T')[0];
  } else if (query.period === 'yesterday') {
    startObj.setDate(startObj.getDate() - 1);
    endObj.setDate(endObj.getDate() - 1);
    start = startObj.toISOString().split('T')[0];
    end = endObj.toISOString().split('T')[0];
  } else {
    end = localToday.toISOString().split('T')[0];
    if (query.period === '7d') startObj.setDate(startObj.getDate() - 7);
    else if (query.period === '90d') startObj.setDate(startObj.getDate() - 90);
    else if (query.period === '1y') startObj.setFullYear(startObj.getFullYear() - 1);
    else startObj.setDate(startObj.getDate() - 30); // default 30d
    start = startObj.toISOString().split('T')[0];
  }

  const diffTime = Math.abs(new Date(end) - new Date(start));
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    mode: 'period',
    period: query.period || '30d',
    interval,
    start,
    end,
    days: Math.max(1, diffDays),
    sqlFilter: `date >= CURRENT_DATE - $1::interval`,
    sqlFilterAlt: `ordered_at >= CURRENT_DATE - $1::interval`,
    sqlFilterCreatedAt: `created_at >= CURRENT_DATE - $1::interval`,
    params: [interval]
  };
};
