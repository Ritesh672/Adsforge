const pool = require('./src/config/db');

async function migrate() {
  try {
    console.log('Running migration...');
    await pool.query(`
      ALTER TABLE daily_performance ADD COLUMN IF NOT EXISTS meta_add_to_cart INTEGER DEFAULT 0;
      ALTER TABLE daily_performance ADD COLUMN IF NOT EXISTS meta_initiate_checkout INTEGER DEFAULT 0;
    `);
    console.log('Migration successful');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
