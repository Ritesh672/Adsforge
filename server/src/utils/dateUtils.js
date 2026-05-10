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
    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = daysMap[query.period] || 30;

    // Rolling periods use completed days only: last 7d means yesterday and the 6 days before it.
    endObj.setDate(endObj.getDate() - 1);
    startObj.setTime(endObj.getTime());
    startObj.setDate(endObj.getDate() - (days - 1));

    start = startObj.toISOString().split('T')[0];
    end = endObj.toISOString().split('T')[0];
  }

  const diffTime = Math.abs(new Date(end) - new Date(start));
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    mode: 'period',
    period: query.period || '30d',
    start,
    end,
    days: Math.max(1, diffDays + 1),
    sqlFilter: `date >= $1 AND date <= $2`,
    sqlFilterAlt: `ordered_at::date >= $1 AND ordered_at::date <= $2`,
    sqlFilterCreatedAt: `created_at::date >= $1 AND created_at::date <= $2`,
    params: [start, end]
  };
};
