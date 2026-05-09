const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');

router.get('/overview', metaController.getOverview);
router.get('/daily', metaController.getDailyData);
router.post('/sync', metaController.triggerMetaSync);
router.get('/sync/status', metaController.getMetaSyncStatus);

module.exports = router;
