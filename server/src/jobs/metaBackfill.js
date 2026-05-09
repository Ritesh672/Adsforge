const pool = require('../config/db');
const { fetchAccountDailyInsights } = require('../services/meta');

/**
 * Historical Meta data backfill (1 Year)
 */
const runMetaBackfill = async () => {
  console.log('Starting Meta backfill...');
  
  let syncLogId;
  try {
    // 1. Log start
    const logRes = await pool.query(
      `INSERT INTO sync_logs (sync_type, status, started_at) 
       VALUES ($1, $2, NOW()) RETURNING id`,
      ['meta_backfill', 'in_progress']
    );
    syncLogId = logRes.rows[0].id;

    // 2. Calculate date range
    const formatDate = (date) => date.toISOString().split('T')[0];
    const endDate = formatDate(new Date());
    const startDate = formatDate(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));

    // 3. Fetch data
    const insights = await fetchAccountDailyInsights(startDate, endDate);
    console.log(`Fetched ${insights.length} days of Meta data`);

    // 4. Upsert into daily_performance
    for (let i = 0; i < insights.length; i++) {
      const d = insights[i];
      await pool.query(
        `INSERT INTO daily_performance (
          date, total_ad_spend, impressions, clicks, ctr, 
          cpc, cpm, reach, frequency, 
          meta_purchases, meta_purchase_value,
          meta_add_to_cart, meta_initiate_checkout
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (date) DO UPDATE SET
          total_ad_spend = EXCLUDED.total_ad_spend,
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          ctr = EXCLUDED.ctr,
          cpc = EXCLUDED.cpc,
          cpm = EXCLUDED.cpm,
          reach = EXCLUDED.reach,
          frequency = EXCLUDED.frequency,
          meta_purchases = EXCLUDED.meta_purchases,
          meta_purchase_value = EXCLUDED.meta_purchase_value,
          meta_add_to_cart = EXCLUDED.meta_add_to_cart,
          meta_initiate_checkout = EXCLUDED.meta_initiate_checkout`,
        [
          d.date, d.total_ad_spend, d.impressions, d.clicks, d.ctr,
          d.cpc, d.cpm, d.reach, d.frequency,
          d.meta_purchases, d.meta_purchase_value,
          d.meta_add_to_cart, d.meta_initiate_checkout
        ]
      );

      // Detailed terminal logging
      process.stdout.write(`✓ Meta Sync: ${d.date} | Spend: $${d.total_ad_spend.toFixed(2)} | Reach: ${d.reach}\n`);

      if ((i + 1) % 30 === 0 && i !== insights.length - 1) {
        console.log(`--- Progress: ${i + 1}/${insights.length} days synced ---`);
      }
    }

    // 5. Update sync_logs
    await pool.query(
      `UPDATE sync_logs SET status = $1, records_synced = $2, completed_at = NOW() WHERE id = $3`,
      ['completed', insights.length, syncLogId]
    );

    console.log('✅ Meta backfill complete');
    return { success: true, records_synced: insights.length };

  } catch (error) {
    console.error('Meta Backfill Error:', error.message);
    if (syncLogId) {
      await pool.query(
        `UPDATE sync_logs SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3`,
        ['failed', error.message, syncLogId]
      );
    }
    throw error;
  }
};

module.exports = { runMetaBackfill };
