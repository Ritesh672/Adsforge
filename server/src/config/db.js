const { Pool } = require("pg");
require("dotenv").config({ quiet: true });

// Helper for IST Timestamp
const getISTTime = () => {
  return new Date().toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }) + " IST";
};

const connectionConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
    };

const pool = new Pool({
    ...connectionConfig,
    ssl: {
        rejectUnauthorized: false
    },
    // Cloud Resilience Settings
    max: parseInt(process.env.DB_POOL_MAX || '5', 10),
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return an error if a connection takes > 10s
    keepAlive: true, // Send keep-alive packets to prevent ECONNRESET
});

pool.on('error', (err) => {
    console.error(`[${getISTTime()}] Unexpected error on idle client:`, err.message);
});

pool.connect()
    .then((client) => {
        client.release();
        console.log(`[${getISTTime()}] SUCCESS: Connected to the Supabase database`);
    })
    .catch((err) => console.log(`[${getISTTime()}] DATABASE CONNECTION ERROR:`, err.message));

module.exports = pool;
