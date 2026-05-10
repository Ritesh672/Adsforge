const express = require('express');
const { triggerBackfill, triggerIncrementalSync, triggerUnifiedSync, getSyncStatus, handleWebhook } = require('../controllers/syncController');

const router = express.Router();

router.post('/sync/backfill', triggerBackfill);
router.post('/sync/incremental', triggerIncrementalSync);
router.post('/sync/all', triggerUnifiedSync);
router.get('/sync/status', getSyncStatus);

router.post('/webhook/order-create', (req, res) => handleWebhook(req, res, 'order-create'));
router.post('/webhook/order-update', (req, res) => handleWebhook(req, res, 'order-update'));
router.post('/webhook/refund-create', (req, res) => handleWebhook(req, res, 'refund-create'));
router.post('/webhook/product-update', (req, res) => handleWebhook(req, res, 'product-update'));

module.exports = router;
