const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ quiet: true });

const migrations = [
  'migration_shopify.sql',
  'migration_meta.sql',
  'migration_performance_indexes.sql',
];

async function runMigrations() {
  console.log('========================================');
  console.log('Starting database migrations');
  console.log('========================================');

  const connectionConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      };

  const client = new Client({
    ...connectionConfig,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
    query_timeout: 30000,
  });

  try {
    console.log(`Connecting to ${process.env.DATABASE_URL ? 'DATABASE_URL' : `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`}...`);
    await client.connect();
    console.log('Connected to database');
    await client.query(`SET lock_timeout = '10s'`);
    await client.query(`SET statement_timeout = '30s'`);

    for (const file of migrations) {
      const filePath = path.join(__dirname, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`Running ${file}...`);
      await client.query(sql);
      console.log(`Completed ${file}`);
    }

    console.log('========================================');
    console.log('Database migrations completed');
    console.log('========================================');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('========================================');
    console.error('Database migration failed');
    console.error(error.message);
    console.error('========================================');
    try {
      await client.end();
    } catch (_) {
      // Connection may not have opened.
    }
    process.exit(1);
  }
}

runMigrations();
