const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  discountPrice: {
    type: Number,
    min: 0,
    default: 0
  },
  images: [String],
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'g', 'ml', 'l', 'piece', 'pack']
  },
  quantity: {
    type: Number,
    default: 1,
    min: 0
  },
  inStock: {
    type: Boolean,
    default: true
  },
  attributes: {
    type: Map,
    of: String
  },
  avgRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  featured: {
    type: Boolean,
    default: false
  },
  tags: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Create compound index for better search performance
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

// Create index for category-based queries
productSchema.index({ category: 1 });

// Create index for vendor-based queries
productSchema.index({ vendor: 1 });

// Create index for price-based sorting and filtering
productSchema.index({ price: 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product; 