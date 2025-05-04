const mongoose = require('mongoose');

// Define order status constants
const ORDER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  PICKED_UP: 'picked_up',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  CONFIRMED: 'confirmed',
  DELIVERY_FAILED: 'delivery_failed'
};

// Define payment status constants
const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

// Define payment methods
const PAYMENT_METHOD = {
  CASH_ON_DELIVERY: 'cash_on_delivery',
  ONLINE: 'online',
  WALLET: 'wallet'
};

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  name: String,
  unit: String
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [orderItemSchema],
  deliveryAddress: {
    addressLine1: {
      type: String,
      required: true
    },
    addressLine2: String,
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    pincode: {
      type: String,
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      },
      locationName: String
    }
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0
  },
  tax: {
    type: Number,
    required: true,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: Object.values(PAYMENT_METHOD),
    required: true
  },
  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING
  },
  paymentDetails: {
    transactionId: String,
    paymentGateway: String,
    paymentTime: Date
  },
  status: {
    type: String,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.PENDING
  },
  statusHistory: [{
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS)
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  }],
  deliveryAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  estimatedDeliveryTime: {
    type: Date
  },
  actualDeliveryTime: {
    type: Date
  },
  cancellationReason: {
    type: String
  },
  rejectionReason: {
    type: String
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  review: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Enhanced tracking fields
  deliveryTracking: {
    startedAt: Date,
    estimatedPickupTime: Date,
    actualPickupTime: Date,
    estimatedDeliveryTime: Date,
    actualDeliveryTime: Date,
    deliveryDistance: Number, // in kilometers
    deliveryRoute: {
      type: {
        type: String,
        enum: ['LineString'],
        default: 'LineString'
      },
      coordinates: {
        type: [[Number]], // Array of [longitude, latitude] points
        default: []
      }
    },
    lastLocationUpdate: {
      coordinates: [Number], // [longitude, latitude]
      accuracy: Number,
      timestamp: Date,
      heading: Number,
      speed: Number
    }
  },
  // Delivery issues
  deliveryIssues: [{
    issueType: {
      type: String,
      enum: ['ORDER_DAMAGED', 'ADDRESS_NOT_FOUND', 'CUSTOMER_UNAVAILABLE', 'VEHICLE_BREAKDOWN', 'SAFETY_CONCERN', 'OTHER']
    },
    description: String,
    images: [String],
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reportedAt: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    },
    resolution: {
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      resolvedAt: Date,
      notes: String
    }
  }],
  // Delivery ETAs and time tracking
  deliveryETAUpdates: [{
    estimatedMinutes: Number,
    newETA: Date,
    reason: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

// Create unique index for order number
orderSchema.index({ orderNumber: 1 }, { unique: true });

// Create index for faster queries by customer
orderSchema.index({ customer: 1 });

// Create index for faster queries by vendor
orderSchema.index({ vendor: 1 });

// Create index for faster queries by delivery agent
orderSchema.index({ deliveryAgent: 1 });

// Create index for faster queries by status
orderSchema.index({ status: 1 });

// Create compound index for order status and timestamps
orderSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook to generate order number if not already set
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    // Generate order number: OLV + timestamp + last 4 digits of ObjectId
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const objectIdStr = this._id.toString();
    const last4 = objectIdStr.substring(objectIdStr.length - 4);
    this.orderNumber = `OLV${timestamp}${last4}`;
  }
  
  // Add status change to status history if status has changed
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
      updatedBy: this.updatedBy || this.customer // default to customer if not specified
    });
  }
  
  next();
});

const Order = mongoose.model('Order', orderSchema);

module.exports = {
  Order,
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD
}; 