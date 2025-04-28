const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const { authenticate, isDeliveryAgent } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticate, isDeliveryAgent);

// Profile management
router.get('/profile', deliveryController.getProfile);
router.put('/profile/update', deliveryController.updateProfile);

// Location management
router.put('/location/update', deliveryController.updateLocation);

// Order/Job management
router.get('/jobs/assigned', deliveryController.getAssignedOrders);
router.get('/jobs/nearby', deliveryController.getNearbyOrders);
router.get('/orders/:id', deliveryController.getOrderDetails);
router.put('/orders/:id/accept', deliveryController.acceptOrder);
router.put('/jobs/:id/reject', deliveryController.rejectDeliveryJob);
router.put('/orders/:id/pickup', deliveryController.pickupOrder);
router.put('/orders/:id/start', deliveryController.startDelivery);
router.put('/orders/:id/delivered', deliveryController.completeDelivery);

// Earnings & Financials
router.get('/earnings', deliveryController.getEarnings);
router.get('/wallet', deliveryController.getWallet);
router.get('/history', deliveryController.getDeliveryHistory);

module.exports = router; 