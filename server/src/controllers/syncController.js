const pool = require('../config/db');
const { runBackfill, runIncrementalSync } = require('../jobs/backfill');
const { runMetaIncrementalSync } = require('../jobs/metaBackfill');
const { handleOrderCreate, handleOrderUpdate, handleRefundCreate, handleProductUpdate } = require('../jobs/webhooks');

const triggerBackfill = async (req, res) => {
  console.log('Received request to trigger backfill');
  try {
    runBackfill().catch(err => console.error('Background Backfill Error:', err));
    
    res.status(202).json({
      success: true,
      message: 'Backfill process started in the background'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start backfill',
      error: error.message
    });
  }
};

const triggerIncrementalSync = async (req, res) => {
  console.log('Received request for incremental sync');
  try {
    runIncrementalSync().catch(err => console.error('Background Incremental Sync Error:', err));
    
    res.status(202).json({
      success: true,
      message: 'Incremental sync started in the background'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start incremental sync',
      error: error.message
    });
  }
};

const triggerUnifiedSync = async (req, res) => {
  console.log('Received request for unified Meta + Shopify sync');
  try {
    Promise.allSettled([
      runIncrementalSync(),
      runMetaIncrementalSync(),
    ]).then((results) => {
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length) {
        console.error('Unified sync completed with failures:', failed.map((result) => result.reason?.message || result.reason));
      } else {
        console.log('Unified sync completed successfully');
      }
    });

    res.status(202).json({
      success: true,
      message: 'Meta and Shopify sync started in the background'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start unified sync',
      error: error.message
    });
  }
};

const getSyncStatus = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sync_logs ORDER BY started_at DESC LIMIT 5'
    );
    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sync status',
      error: error.message
    });
  }
};

const handleWebhook = async (req, res, type) => {
  const payload = req.body;

  try {
    switch (type) {
      case 'order-create':
        await handleOrderCreate(payload);
        break;
      case 'order-update':
        await handleOrderUpdate(payload);
        break;
      case 'refund-create':
        await handleRefundCreate(payload);
        break;
      case 'product-update':
        await handleProductUpdate(payload);
        break;
      default:
        console.log(`Unknown webhook type: ${type}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error(`Webhook Error (${type}):`, error.message);
    res.status(200).send('Error handled');
  }
};

module.exports = {
  triggerBackfill,
  triggerIncrementalSync,
  triggerUnifiedSync,
  getSyncStatus,
  handleWebhook
};
