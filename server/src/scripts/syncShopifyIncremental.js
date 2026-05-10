const pool = require('../config/db');
const { runIncrementalSync } = require('../jobs/backfill');

async function main() {
  console.log('========================================');
  console.log('Starting Shopify incremental sync');
  console.log('========================================');

  try {
    const result = await runIncrementalSync();
    console.log('========================================');
    console.log('Shopify incremental sync completed');
    console.log(result);
    console.log('========================================');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('========================================');
    console.error('Shopify incremental sync failed');
    console.error(error.message);
    console.error('========================================');
    await pool.end();
    process.exit(1);
  }
}

main();
