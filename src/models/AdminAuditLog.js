const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const AdminAuditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'LOGIN', 'OTHER']
  },
  entity: {
    type: String,
    required: true,
    enum: ['USER', 'VENDOR', 'DELIVERY_AGENT', 'CUSTOMER', 'PRODUCT', 'CATEGORY', 'ORDER', 'FAQ', 'BANNER', 'SETTINGS']
  },
  entityId: {
    type: String
  },
  details: {
    type: Object
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

AdminAuditLogSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('AdminAuditLog', AdminAuditLogSchema); 