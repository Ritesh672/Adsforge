const express = require('express');
const analyticsController = require('../controllers/analyticsController');
const router = express.Router();

router.get('/insights/top-performers', analyticsController.getTopPerformers);
router.get('/insights/dead-variants', analyticsController.getDeadVariants);
router.get('/insights/size-intelligence', analyticsController.getSizeIntelligence);
router.get('/insights/returns', analyticsController.getReturns);
router.get('/analytics-overview', analyticsController.getProductOverview);
router.get('/portfolio/concentration', analyticsController.getConcentration);
router.get('/portfolio/pareto', analyticsController.getPareto);
router.get('/portfolio/bought-together', analyticsController.getBoughtTogether);
router.get('/portfolio/price-impact', analyticsController.getPriceImpact);

module.exports = router;
