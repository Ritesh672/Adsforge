const express = require('express');
const productController = require('../controllers/productController');
const router = express.Router();

router.get('/products', productController.getAllProducts);
router.get('/products/:id', productController.getProductById);
router.get('/products/:id/sales', productController.getProductSales);
router.get('/products/:id/revenue', productController.getProductRevenue);

module.exports = router;
