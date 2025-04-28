const mongoose = require('mongoose');

const TRANSACTION_TYPES = {
  CREDIT: 'credit',
  DEBIT: 'debit'
};

const TRANSACTION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

const TRANSACTION_CATEGORIES = {
  ORDER_PAYMENT: 'order_payment',
  ORDER_REFUND: 'order_refund',
  DELIVERY_EARNINGS: 'delivery_earnings',
  VENDOR_SETTLEMENT: 'vendor_settlement',
  ADMIN_ADJUSTMENT: 'admin_adjustment',
  WITHDRAWAL: 'withdrawal',
  DEPOSIT: 'deposit'
};

const walletTransactionSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(TRANSACTION_TYPES),
    required: true
  },
  category: {
    type: String,
    enum: Object.values(TRANSACTION_CATEGORIES),
    required: true
  },
  status: {
    type: String,
    enum: Object.values(TRANSACTION_STATUS),
    default: TRANSACTION_STATUS.COMPLETED
  },
  reference: {
    type: String
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  description: {
    type: String
  },
  metadata: {
    type: Object
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  transactions: [walletTransactionSchema],
  isActive: {
    type: Boolean,
    default: true
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

// Create index for better query performance
walletSchema.index({ user: 1 });
walletSchema.index({ 'transactions.createdAt': -1 });
walletSchema.index({ 'transactions.status': 1 });

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = {
  Wallet,
  TRANSACTION_TYPES,
  TRANSACTION_STATUS,
  TRANSACTION_CATEGORIES
}; 