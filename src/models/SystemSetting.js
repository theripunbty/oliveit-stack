const mongoose = require('mongoose');

const SystemSettingSchema = new mongoose.Schema({
  deliveryFeeBase: {
    type: Number,
    default: 2.99,
    min: 0
  },
  deliveryFeePerKm: {
    type: Number,
    default: 0.5,
    min: 0
  },
  serviceFeePercentage: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },
  taxPercentage: {
    type: Number,
    default: 7,
    min: 0,
    max: 100
  },
  vendorCommissionPercentage: {
    type: Number,
    default: 15,
    min: 0,
    max: 100
  },
  deliveryAgentCommissionPercentage: {
    type: Number,
    default: 80,
    min: 0,
    max: 100
  },
  appVersion: {
    android: {
      type: String,
      default: '1.0.0'
    },
    ios: {
      type: String,
      default: '1.0.0'
    }
  },
  maintenance: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'The app is currently under maintenance. Please try again later.'
  }
}, { timestamps: true });

module.exports = mongoose.model('SystemSetting', SystemSettingSchema); 