const pool = require('../config/db');
const { runRefundSync } = require('../jobs/backfill');

async function main() {
  console.log('========================================');
  console.log('Starting Shopify refund-only sync');
  console.log('========================================');

  try {
    const result = await runRefundSync();
    console.log('========================================');
    console.log('Shopify refund-only sync completed');
    console.log(result);
    console.log('========================================');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('========================================');
    console.error('Shopify refund-only sync failed');
    console.error(error.message);
    console.error('========================================');
    await pool.end();
    process.exit(1);
  }
}
main();
