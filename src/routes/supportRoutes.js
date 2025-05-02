const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public routes
router.post('/chat', supportController.initializeChat);
router.get('/chat/:chatId', supportController.getChatById);
router.post('/chat/:chatId/message', supportController.addMessage);
router.put('/chat/:chatId/read', supportController.markMessagesAsRead);

// Admin-only routes
router.get('/chats', protect, restrictTo('admin'), supportController.getAllChats);
router.put('/chat/:chatId', protect, restrictTo('admin'), supportController.updateChat);
router.delete('/chat/inactive', protect, restrictTo('admin'), supportController.deleteInactiveChats);
router.delete('/chats/inactive', protect, restrictTo('admin'), supportController.deleteInactiveChats);
router.delete('/chat/:chatId', protect, restrictTo('admin'), supportController.deleteChat);

module.exports = router; 