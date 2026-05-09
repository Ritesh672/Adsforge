require("dotenv").config();
const express = require("express");
const cors = require("cors");
const pool = require("./src/config/db");
const cron = require('node-cron');

const syncRoutes = require("./src/routes/syncRoutes");
const productRoutes = require("./src/routes/productRoutes");
const analyticsRoutes = require("./src/routes/analyticsRoutes");
const metaRoutes = require("./src/routes/metaRoutes");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Global Request Logger
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Routes
app.use("/api", syncRoutes);
app.use("/api", productRoutes);
app.use("/api", analyticsRoutes);
app.use("/api/meta", metaRoutes);

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Nightly Meta sync at 2 AM IST (20:30 UTC)
cron.schedule('30 20 * * *', async () => {
  console.log('Running nightly Meta sync...');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];
  
  try {
    const { fetchAccountDailyInsights } = require('./src/services/meta');
    const db = require('./src/config/db');
    
    const insights = await fetchAccountDailyInsights(dateStr, dateStr);
    if (insights.length > 0) {
      const d = insights[0];
      await db.query(`
        INSERT INTO daily_performance (
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
          meta_initiate_checkout = EXCLUDED.meta_initiate_checkout
      `, [d.date, d.total_ad_spend, d.impressions, d.clicks,
          d.ctr, d.cpc, d.cpm, d.reach, d.frequency,
          d.meta_purchases, d.meta_purchase_value,
          d.meta_add_to_cart, d.meta_initiate_checkout]);
      console.log(`Nightly Meta sync complete for ${dateStr}`);
    }
  } catch (error) {
    console.error('Nightly Meta sync failed:', error.message);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('Database connection error:', err.stack);
    } else {
      console.log('Database connection successful at:', res.rows[0].now);
    }
  });
});