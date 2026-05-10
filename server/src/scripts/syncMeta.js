const pool = require('../config/db');
const { runMetaBackfill } = require('../jobs/metaBackfill');

async function main() {
  console.log('========================================');
  console.log('Starting Meta data sync');
  console.log('========================================');

  try {
    const result = await runMetaBackfill();
    console.log('========================================');
    console.log('Meta data sync completed');
    console.log(result);
    console.log('========================================');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('========================================');
    console.error('Meta data sync failed');
    console.error(error.message);
    console.error('========================================');
    await pool.end();
    process.exit(1);
  }
}

main();
