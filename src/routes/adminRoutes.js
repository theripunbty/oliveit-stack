const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { logAdminAction } = require('../middleware/auditLogger');
const upload = require('../middleware/upload');

// Apply middleware to all routes
router.use(authenticate);
router.use(isAdmin);
router.use(logAdminAction);

// Special case for DELETE vendor route - handle this first
router.delete('/vendors/:id([0-9a-fA-F]{24})', adminController.deleteVendor);

// Vendor management routes
router.get('/vendors', adminController.getVendors);
router.get('/vendors/registrations/pending', adminController.getPendingVendorRegistrations);
router.get('/vendors/find/:vendorId', adminController.findVendorByFormattedId);
router.get('/vendors/registrations/:id', adminController.getVendorRegistrationDetails);
router.get('/vendors/:id', adminController.getVendorDetails);
router.get('/vendors/:id/documents', adminController.getVendorDocuments);
router.put('/vendors/:id/approve', adminController.approveVendor);
router.put('/vendors/:id/reject', adminController.rejectVendor);

// Delivery agent management routes
router.get('/delivery-agents', adminController.getDeliveryAgents);
router.get('/delivery-agents/:id', adminController.getDeliveryAgentDetails);
router.put('/delivery-agents/:id/approve', adminController.approveDeliveryAgent);
router.put('/delivery-agents/:id/reject', adminController.rejectDeliveryAgent);

// Customer management routes
router.get('/customers', adminController.getCustomers);
router.get('/customers/find/:customerId', adminController.findCustomerById);
router.get('/customers/:id', adminController.getCustomerDetails);

// Order management routes
router.get('/orders', adminController.getOrders);
router.get('/orders/:id', adminController.getOrderDetails);

// Category management routes
router.get('/categories', adminController.getCategories);
router.post('/categories', upload.single('image'), adminController.createCategory);
router.put('/categories/:id', upload.single('image'), adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

// CMS management routes
router.get('/faqs', adminController.getFaqs);
router.post('/faqs', adminController.createFaq);
router.put('/faqs/:id', adminController.updateFaq);
router.delete('/faqs/:id', adminController.deleteFaq);

router.get('/banners', adminController.getBanners);
router.post('/banners', upload.single('image'), adminController.createBanner);
router.put('/banners/:id', upload.single('image'), adminController.updateBanner);
router.delete('/banners/:id', adminController.deleteBanner);

// System Settings Routes
router.get('/settings', adminController.getSystemSettings);
router.put('/settings', adminController.updateSystemSettings);

// System Restart Route
router.post('/system/restart', adminController.restartSystem);

// Audit Logs Route
router.get('/audit-logs', adminController.getAuditLogs);

// Dashboard routes
router.get('/dashboard/stats', adminController.getDashboardStats);

module.exports = router; 