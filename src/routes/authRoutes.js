const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { profileUpload, storeUpload, kycUpload } = require('../middleware/multerConfig');

// Customer registration and login
router.post('/register/customer', otpLimiter, authController.registerCustomer);
router.post('/login/customer', otpLimiter, authController.loginWithOTP);

// Vendor registration and login
const vendorUploadFields = [
  { name: 'profileImage', maxCount: 1 },
  { name: 'storePhoto', maxCount: 1 },
  { name: 'aadhaarPhoto', maxCount: 1 },
  { name: 'panPhoto', maxCount: 1 }
];
router.post('/register/vendor', authLimiter, profileUpload.fields(vendorUploadFields), authController.registerVendor);
router.post('/login/vendor', authLimiter, authController.loginVendor);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authLimiter, authController.resetPassword);

// Delivery agent registration and login
router.post('/register/delivery', otpLimiter, authController.registerDeliveryAgent);
router.post('/login/delivery', otpLimiter, authController.loginWithOTP);

// Admin registration and login
router.post('/register/admin', authLimiter, authController.registerAdmin);
router.post('/login/admin', authLimiter, authController.loginAdmin);

// OTP verification
router.post('/verify-otp', otpLimiter, authController.verifyOTPAndLogin);
router.post('/verify-otp/register', otpLimiter, authController.verifyOTPAndRegister);
router.post('/verify-otp/register/vendor', otpLimiter, authController.verifyOTPAndRegisterVendor);
router.post('/verify-otp/register/delivery', otpLimiter, authController.verifyOTPAndRegisterDeliveryAgent);
router.post('/verify-otp/login/vendor', otpLimiter, authController.verifyOTPAndLoginVendor);

// Username availability check
router.post('/check-username', authLimiter, authController.checkUsernameAvailability);

// Token management
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authenticate, authController.logout);

// User location
router.get('/user/location', authenticate, authController.getUserLocation);
router.put('/user/location', authenticate, authController.updateUserLocation);

module.exports = router; 