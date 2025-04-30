const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate, isCustomer } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticate, isCustomer);

// Profile management
router.get('/profile', customerController.getProfile);
router.put('/profile/update', customerController.updateProfile);

// Address management
router.get('/addresses', customerController.getAddresses);
router.post('/addresses/add', customerController.addAddress);
router.put('/addresses/:id', customerController.updateAddress);
router.delete('/addresses/:id', customerController.deleteAddress);
router.put('/addresses/:id/default', customerController.setDefaultAddress);

// Cart management
router.post('/cart/add', customerController.addToCart);
router.delete('/cart/remove/:productId', customerController.removeFromCart);
router.put('/cart/update/:productId', customerController.updateCartItem);
router.get('/cart', customerController.getCart);
router.delete('/cart', customerController.clearCart);

// Order management
router.post('/checkout', customerController.checkout);
router.post('/orders', customerController.createOrder);
router.get('/orders', customerController.getOrders);
router.get('/orders/:id', customerController.getOrderDetails);
router.put('/orders/:id/cancel', customerController.cancelOrder);
router.post('/orders/:id/rate', customerController.rateOrder);
router.get('/orders/:id/track', customerController.trackOrder);

// Location endpoints
router.put('/location', customerController.updateLocation);
router.get('/location', customerController.getLocation);

// Order tracking (Socket.IO connection will be handled separately)

module.exports = router; 