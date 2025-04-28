const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');

// Customer registration and login
router.post('/register/customer', otpLimiter, authController.registerCustomer);
router.post('/login/customer', otpLimiter, authController.loginWithOTP);

// Vendor registration and login
router.post('/register/vendor', authLimiter, authController.registerVendor);
router.post('/login/vendor', authLimiter, authController.loginWithPassword);

// Delivery agent registration and login
router.post('/register/delivery', otpLimiter, authController.registerDeliveryAgent);
router.post('/login/delivery', otpLimiter, authController.loginWithOTP);

// Admin registration and login
router.post('/register/admin', authLimiter, authController.registerAdmin);
router.post('/login/admin', authLimiter, authController.loginAdmin);

// OTP verification
router.post('/verify-otp', otpLimiter, authController.verifyOTPAndLogin);
router.post('/verify-otp/register', otpLimiter, authController.verifyOTPAndRegister);

// Token management
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);

module.exports = router; 