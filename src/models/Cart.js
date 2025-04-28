const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
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
  }
});

const cartSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [cartItemSchema],
  subtotal: {
    type: Number,
    default: 0
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

// Create index for faster customer queries
// cartSchema.index({ customer: 1 }); // Removed duplicate index

// Create index for faster vendor queries
cartSchema.index({ vendor: 1 });

// Method to calculate cart total
cartSchema.methods.calculateSubtotal = function() {
  this.subtotal = this.items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);
  return this.subtotal;
};

// Pre-save hook to calculate subtotal before saving
cartSchema.pre('save', function(next) {
  this.calculateSubtotal();
  next();
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart; 