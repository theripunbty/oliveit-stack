const SupportChat = require('../models/SupportChat');
const { v4: uuidv4 } = require('uuid');

/**
 * Initialize a new support chat
 * @route POST /api/support/chat
 * @access Public
 */
const initializeChat = async (req, res) => {
  try {
    const { userType, userId, userName, query, deviceInfo } = req.body;
    
    if (!userType || !userName) {
      return res.status(400).json({ message: 'User type and name are required' });
    }
    
    // Generate unique chat ID
    const chatId = uuidv4();
    
    // Get IP and approximate location
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    
    // Create new chat
    const newChat = await SupportChat.create({
      chatId,
      userType,
      userId: userId || null,
      userName,
      query: query || null,
      ipAddress,
      deviceInfo: deviceInfo || null,
      status: 'waiting',
      priority: 'medium',
      messages: [
        {
          senderId: 'system',
          senderType: 'admin',
          content: 'Welcome to OliveIt support! How can we help you today?',
          type: 'system',
          timestamp: new Date()
        }
      ],
      lastMessage: 'Welcome to OliveIt support! How can we help you today?',
      lastMessageTime: new Date()
    });
    
    return res.status(201).json({ 
      success: true,
      chat: {
        chatId: newChat.chatId,
        userType: newChat.userType,
        userName: newChat.userName,
        status: newChat.status,
        messages: newChat.messages
      }
    });
  } catch (error) {
    console.error('Error initializing chat:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get chat details
 * @route GET /api/support/chat/:chatId
 * @access Private (for admin) / Public (for user with the same chatId)
 */
const getChatById = async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const chat = await SupportChat.findOne({ chatId });
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    return res.status(200).json({ success: true, chat });
  } catch (error) {
    console.error('Error getting chat:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Add message to chat
 * @route POST /api/support/chat/:chatId/message
 * @access Private (for admin) / Public (for user with the same chatId)
 */
const addMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { senderId, senderType, content, type, fileInfo } = req.body;
    
    if (!senderId || !senderType || !content) {
      return res.status(400).json({ message: 'Sender ID, type and content are required' });
    }
    
    const chat = await SupportChat.findOne({ chatId });
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // Create new message
    const newMessage = {
      senderId,
      senderType,
      content,
      type: type || 'text',
      fileInfo: fileInfo || null,
      timestamp: new Date(),
      readByAdmin: senderType === 'admin',
      readByUser: senderType !== 'admin'
    };
    
    // Update chat with new message
    chat.messages.push(newMessage);
    chat.lastMessage = content;
    chat.lastMessageTime = new Date();
    
    // If user sends a message and chat is waiting, change to active
    if (senderType !== 'admin' && chat.status === 'waiting') {
      chat.status = 'active';
    }
    
    await chat.save();
    
    // Emit socket event to notify about new message
    const io = req.app.get('socketio');
    io.to(`chat-${chatId}`).emit('support-message-received', newMessage);
    
    return res.status(201).json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Error adding message:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Mark messages as read
 * @route PUT /api/support/chat/:chatId/read
 * @access Private (for admin) / Public (for user with the same chatId)
 */
const markMessagesAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { isAdmin } = req.body;
    
    const chat = await SupportChat.findOne({ chatId });
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    // Mark messages as read
    chat.messages = chat.messages.map(message => {
      if (isAdmin) {
        message.readByAdmin = true;
      } else {
        message.readByUser = true;
      }
      return message;
    });
    
    await chat.save();
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get all active chats (for admin)
 * @route GET /api/support/chats
 * @access Private (admin only)
 */
const getAllChats = async (req, res) => {
  try {
    const { status, userType, priority, limit = 50, page = 1 } = req.query;
    
    const filter = {};
    
    if (status) filter.status = status;
    if (userType) filter.userType = userType;
    if (priority) filter.priority = priority;
    
    const chats = await SupportChat.find(filter)
      .select('-messages') // Exclude messages for performance
      .sort({ lastMessageTime: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await SupportChat.countDocuments(filter);
    
    return res.status(200).json({ 
      success: true, 
      chats,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error getting chats:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Update chat status or priority
 * @route PUT /api/support/chat/:chatId
 * @access Private (admin only)
 */
const updateChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { status, priority, assignedTo } = req.body;
    
    const chat = await SupportChat.findOne({ chatId });
    
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    if (status) chat.status = status;
    if (priority) chat.priority = priority;
    if (assignedTo) chat.assignedTo = assignedTo;
    
    await chat.save();
    
    // Notify about status change
    if (status) {
      const io = req.app.get('socketio');
      io.to(`chat-${chatId}`).emit('support-status-updated', { status });
    }
    
    return res.status(200).json({ success: true, chat });
  } catch (error) {
    console.error('Error updating chat:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Delete inactive chats
 * @route DELETE /api/support/chat/inactive
 * @access Private (admin only)
 */
const deleteInactiveChats = async (req, res) => {
  try {
    // Calculate the time 30 minutes ago
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // Find chats that haven't been updated in the last 30 minutes
    const result = await SupportChat.deleteMany({
      lastMessageTime: { $lt: thirtyMinutesAgo },
      status: { $ne: 'resolved' } // Don't delete resolved chats automatically
    });
    
    console.log(`Deleted ${result.deletedCount} inactive chats`);
    
    return res.status(200).json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} inactive chats`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting inactive chats:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Delete a specific chat
 * @route DELETE /api/support/chat/:chatId
 * @access Private (admin only)
 */
const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const result = await SupportChat.deleteOne({ chatId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    
    return res.status(200).json({ 
      success: true, 
      message: 'Chat deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting chat:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  initializeChat,
  getChatById,
  addMessage,
  markMessagesAsRead,
  getAllChats,
  updateChat,
  deleteInactiveChats,
  deleteChat
}; 