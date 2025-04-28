const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Define user roles as constants
const USER_ROLES = {
  CUSTOMER: 'customer',
  VENDOR: 'vendor',
  DELIVERY: 'delivery',
  ADMIN: 'admin'
};

// Define user status types
const USER_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  REJECTED: 'rejected'
};

const userSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    required: true
  },
  customerId: {
    type: String,
    unique: true,
    sparse: true, // Only enforces uniqueness for documents that have this field
    validate: {
      validator: function(v) {
        // Only validate for customers
        if (this.role !== USER_ROLES.CUSTOMER) return true;
        return /^\d{6,8}$/.test(v);
      },
      message: 'Customer ID must be a 6-8 digit number'
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        // Only required for vendors and admins
        if (this.role === USER_ROLES.VENDOR || this.role === USER_ROLES.ADMIN) {
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        }
        return true;
      },
      message: 'Please enter a valid email'
    }
  },
  password: {
    type: String,
    // Password is only required for vendors and admins
    validate: {
      validator: function(v) {
        return !(this.role === USER_ROLES.VENDOR || this.role === USER_ROLES.ADMIN) || 
          (v && v.length >= 8);
      },
      message: 'Password must be at least 8 characters long'
    }
  },
  phone: {
    type: String,
    required: function() {
      // Phone is required for customers and delivery agents
      return this.role === USER_ROLES.CUSTOMER || this.role === USER_ROLES.DELIVERY;
    },
    validate: {
      validator: function(v) {
        return /^\d{10}$/.test(v);
      },
      message: 'Please enter a valid 10-digit phone number'
    }
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  profileImage: {
    type: String
  },
  status: {
    type: String,
    enum: Object.values(USER_STATUS),
    default: function() {
      // Set default status based on role
      if (this.role === USER_ROLES.VENDOR || this.role === USER_ROLES.DELIVERY) {
        return USER_STATUS.PENDING;
      }
      return USER_STATUS.ACTIVE;
    }
  },
  rejectionReason: {
    type: String
  },
  kycDocuments: [{
    type: {
      type: String,
      enum: ['ID_PROOF', 'ADDRESS_PROOF', 'BUSINESS_LICENSE', 'GST', 'OTHER']
    },
    documentUrl: String,
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED'],
      default: 'PENDING'
    }
  }],
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: function() {
        return this.role === USER_ROLES.VENDOR || this.role === USER_ROLES.DELIVERY;
      },
      // Default coordinates for customer and admin to avoid geo validation errors
      default: function() {
        return (this.role === USER_ROLES.CUSTOMER || this.role === USER_ROLES.ADMIN) ? [0, 0] : undefined;
      }
    },
    locationName: String
  },
  walletBalance: {
    type: Number,
    default: 0
  },
  refreshToken: {
    type: String
  },
  deviceTokens: [String],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Create geospatial index for location queries
userSchema.index({ location: '2dsphere' });

// Pre-save hook to hash password and generate customerId
userSchema.pre('save', async function(next) {
  // Hash password
  if (this.isModified('password') && this.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
      return next(error);
    }
  }
  
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

const User = mongoose.model('User', userSchema);

module.exports = {
  User,
  USER_ROLES,
  USER_STATUS
}; 