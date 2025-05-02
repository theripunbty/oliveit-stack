const mongoose = require('mongoose');

const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
  SYSTEM: 'system'
};

const USER_TYPES = {
  CUSTOMER: 'customer',
  VENDOR: 'vendor',
  ADMIN: 'admin',
  ANONYMOUS: 'anonymous'
};

const CHAT_STATUS = {
  ACTIVE: 'active',
  RESOLVED: 'resolved',
  PENDING: 'pending',
  WAITING: 'waiting'
};

const messageSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true
  },
  senderType: {
    type: String,
    enum: Object.values(USER_TYPES),
    required: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(MESSAGE_TYPES),
    default: MESSAGE_TYPES.TEXT
  },
  fileInfo: {
    name: String,
    size: Number,
    type: String,
    url: String
  },
  readByAdmin: {
    type: Boolean,
    default: false
  },
  readByUser: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: true, timestamps: true });

const supportChatSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    unique: true
  },
  userType: {
    type: String,
    enum: Object.values(USER_TYPES),
    required: true
  },
  userId: {
    type: String,
    sparse: true // Allow null/undefined but enforce uniqueness if present
  },
  userName: {
    type: String,
    required: true
  },
  userAvatar: {
    type: String
  },
  query: {
    type: String
  },
  status: {
    type: String,
    enum: Object.values(CHAT_STATUS),
    default: CHAT_STATUS.WAITING
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true
  },
  ipAddress: {
    type: String
  },
  location: {
    type: String
  },
  deviceInfo: {
    type: Object
  },
  messages: [messageSchema],
  lastMessage: {
    type: String
  },
  lastMessageTime: {
    type: Date
  },
  metadata: {
    type: Object
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Create index for faster queries
supportChatSchema.index({ userType: 1 });
supportChatSchema.index({ status: 1 });
supportChatSchema.index({ priority: 1 });
supportChatSchema.index({ userId: 1 });
supportChatSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SupportChat', supportChatSchema); 