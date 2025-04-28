const mongoose = require('mongoose');

const CONTENT_TYPES = {
  FAQ: 'faq',
  BANNER: 'banner'
};

const faqSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },
  answer: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['GENERAL', 'CUSTOMERS', 'VENDORS', 'DELIVERY', 'PAYMENTS', 'ORDERS', 'OTHER'],
    default: 'GENERAL'
  },
  order: {
    type: Number,
    default: 0
  }
}, { _id: false });

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String
  },
  imageUrl: {
    type: String,
    required: true
  },
  targetUrl: {
    type: String
  },
  targetType: {
    type: String,
    enum: ['CATEGORY', 'PRODUCT', 'VENDOR', 'EXTERNAL', 'NONE'],
    default: 'NONE'
  },
  targetId: {
    type: String
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  order: {
    type: Number,
    default: 0
  },
  showOnMobile: {
    type: Boolean,
    default: true
  },
  showOnWeb: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const cmsContentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(CONTENT_TYPES),
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  contentData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Create indexes for better query performance
cmsContentSchema.index({ type: 1, isActive: 1 });
cmsContentSchema.index({ 'contentData.order': 1 });

const CmsContent = mongoose.model('CmsContent', cmsContentSchema);

module.exports = {
  CmsContent,
  CONTENT_TYPES,
  faqSchema,
  bannerSchema
}; 