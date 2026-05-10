const pool = require('../config/db');
const { runBackfill } = require('../jobs/backfill');

async function main() {
  console.log('========================================');
  console.log('Starting Shopify data sync');
  console.log('========================================');

  try {
    const result = await runBackfill();
    console.log('========================================');
    console.log('Shopify data sync completed');
    console.log(result);
    console.log('========================================');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('========================================');
    console.error('Shopify data sync failed');
    console.error(error.message);
    console.error('========================================');
    await pool.end();
    process.exit(1);
  }
}

main();
