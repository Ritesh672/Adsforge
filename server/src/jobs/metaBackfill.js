const pool = require('../config/db');
const { fetchAccountDailyInsights } = require('../services/meta');

const formatDate = (date) => date.toISOString().split('T')[0];

const upsertMetaInsights = async (insights) => {
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
        d.meta_add_to_cart, d.meta_initiate_checkout,
      ]
    );

    process.stdout.write(`Meta Sync: ${d.date} | Spend: ${d.total_ad_spend.toFixed(2)} | Reach: ${d.reach}\n`);

    if ((i + 1) % 30 === 0 && i !== insights.length - 1) {
      console.log(`--- Progress: ${i + 1}/${insights.length} days synced ---`);
    }
  }
};

const markSyncComplete = async (syncLogId, status, recordsSynced, errorMessage = null) => {
  await pool.query(
    `UPDATE sync_logs
     SET status = $1, records_synced = $2, error_message = $3, completed_at = NOW()
     WHERE id = $4`,
    [status, recordsSynced, errorMessage, syncLogId]
  );
};

const startSyncLog = async (syncType) => {
  const logRes = await pool.query(
    `INSERT INTO sync_logs (sync_type, status, started_at)
     VALUES ($1, $2, NOW()) RETURNING id`,
    [syncType, 'in_progress']
  );
  return logRes.rows[0].id;
};

const runMetaBackfill = async () => {
  console.log('Starting Meta backfill...');
  const syncLogId = await startSyncLog('meta_backfill');

  try {
    const endDate = formatDate(new Date());
    const startDate = formatDate(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));

    const insights = await fetchAccountDailyInsights(startDate, endDate);
    console.log(`Fetched ${insights.length} days of Meta data`);

    await upsertMetaInsights(insights);
    await markSyncComplete(syncLogId, 'completed', insights.length);

    console.log('Meta backfill complete');
    return { success: true, records_synced: insights.length };
  } catch (error) {
    console.error('Meta Backfill Error:', error.message);
    await markSyncComplete(syncLogId, 'failed', 0, error.message);
    throw error;
  }
};

const runMetaIncrementalSync = async () => {
  console.log('Starting Meta incremental sync...');
  const syncLogId = await startSyncLog('meta_incremental_sync');

  try {
    const lastMetaRes = await pool.query('SELECT MAX(date) as max_date FROM daily_performance');
    const endDate = formatDate(new Date());
    const lastDate = lastMetaRes.rows[0]?.max_date;

    let startDate;
    if (lastDate) {
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 1);
      startDate = formatDate(nextDate);
    } else {
      startDate = formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    }

    if (new Date(startDate) > new Date(endDate)) {
      console.log('Meta incremental sync already up to date.');
      await markSyncComplete(syncLogId, 'completed', 0);
      return { success: true, records_synced: 0 };
    }

    console.log(`Fetching Meta data from ${startDate} to ${endDate}`);
    const insights = await fetchAccountDailyInsights(startDate, endDate);
    console.log(`Fetched ${insights.length} days of Meta data`);

    await upsertMetaInsights(insights);
    await markSyncComplete(syncLogId, 'completed', insights.length);

    console.log('Meta incremental sync complete');
    return { success: true, records_synced: insights.length };
  } catch (error) {
    console.error('Meta Incremental Sync Error:', error.message);
    await markSyncComplete(syncLogId, 'failed', 0, error.message);
    throw error;
  }
};

module.exports = { runMetaBackfill, runMetaIncrementalSync };
