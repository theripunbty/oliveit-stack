const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authenticate, isVendor } = require('../middleware/auth');
const { productUpload } = require('../middleware/multerConfig');

// Apply authentication middleware to all routes
router.use(authenticate, isVendor);

// Profile management
router.get('/profile', vendorController.getProfile);
router.put('/profile', vendorController.updateProfile);
router.put('/profile/update', vendorController.updateProfile);

// Product management
router.get('/products', vendorController.getProducts);
router.post('/products/create', productUpload.array('images', 5), vendorController.createProduct);
router.get('/products/:id', vendorController.getProduct);
router.put('/products/:id', productUpload.array('images', 5), vendorController.updateProduct);
router.delete('/products/:id', vendorController.deleteProduct);
router.put('/products/:id/stock', vendorController.updateProductStock);

// Order management
router.get('/orders', vendorController.getOrders);
router.get('/orders/:id', vendorController.getOrderDetails);
router.put('/orders/:id/accept', vendorController.acceptOrder);
router.put('/orders/:id/reject', vendorController.rejectOrder);
router.put('/orders/:id/ready', vendorController.orderReadyForPickup);

// Promotion management
router.post('/promotions/create', vendorController.createPromotion);
router.get('/promotions', vendorController.getPromotions);

// Analytics & Financials
router.get('/analytics/sales', vendorController.getSalesAnalytics);
router.get('/wallet', vendorController.getWallet);
router.get('/dashboard', vendorController.getDashboardStats);

module.exports = router; 