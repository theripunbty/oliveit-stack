const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  subtitle: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String,
    required: true
  },
  targetUrl: {
    type: String,
    default: ''
  },
  targetType: {
    type: String,
    enum: ['NONE', 'URL', 'CATEGORY', 'PRODUCT', 'VENDOR'],
    default: 'NONE'
  },
  targetId: {
    type: String,
    default: ''
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null
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
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('Banner', BannerSchema); 