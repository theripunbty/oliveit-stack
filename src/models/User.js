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

// Define vendor category types
const VENDOR_CATEGORIES = [
  "grocery", 
  "electronics", 
  "fashion", 
  "food", 
  "other"
];

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
  vendorId: {
    type: String,
    unique: true,
    sparse: true, // Only enforces uniqueness for documents that have this field
    validate: {
      validator: function(v) {
        // Only validate for vendors
        if (this.role !== USER_ROLES.VENDOR) return true;
        return /^VEN\d{6,8}$/.test(v);
      },
      message: 'Vendor ID must be in format VEN followed by 6-8 digits'
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        // Required for vendors and admins
        if (this.role === USER_ROLES.VENDOR || this.role === USER_ROLES.ADMIN) {
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        }
        return true;
      },
      message: 'Please enter a valid email'
    }
  },
  username: {
    type: String,
    trim: true,
    unique: true,
    sparse: true, // Only enforces uniqueness for documents that have this field
    validate: {
      validator: function(v) {
        // Only required for vendors
        if (this.role === USER_ROLES.VENDOR) {
          return /^[a-zA-Z0-9_]{4,20}$/.test(v);
        }
        return true;
      },
      message: 'Username must be 4-20 characters (letters, numbers, underscore)'
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
      // Phone is required for all users
      return true;
    },
    validate: {
      validator: function(v) {
        return /^\d{10}$/.test(v);
      },
      message: 'Please enter a valid 10-digit phone number'
    }
  },
  fullName: {
    type: String,
    trim: true
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
  // Vendor specific fields
  storeDetails: {
    storeName: {
      type: String,
      trim: true
    },
    storeAddress: {
      type: String,
      trim: true
    },
    storeCategory: {
      type: String,
      enum: VENDOR_CATEGORIES
    },
    storePhoto: {
      type: String
    }
  },
  // Vendor legal documents
  legalDocuments: {
    aadhaarNumber: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^\d{12}$/.test(v);
        },
        message: 'Aadhaar number must be 12 digits'
      }
    },
    aadhaarPhoto: {
      type: String
    },
    panNumber: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v);
        },
        message: 'PAN number must be in valid format (e.g. ABCDE1234F)'
      }
    },
    panPhoto: {
      type: String
    },
    gstinNumber: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(v);
        },
        message: 'GSTIN must be in valid format'
      }
    },
    fssaiNumber: {
      type: String
    }
  },
  // Bank details
  bankDetails: {
    accountNumber: {
      type: String
    },
    ifscCode: {
      type: String,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v);
        },
        message: 'IFSC code must be in valid format'
      }
    },
    accountHolderName: {
      type: String,
      trim: true
    }
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
  
  // Generate vendorId for new vendor users
  if (this.isNew && this.role === USER_ROLES.VENDOR && !this.vendorId) {
    try {
      const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();
      this.vendorId = `VEN${randomDigits}`;
      
      // Check if vendorId already exists and regenerate if needed
      const existingVendor = await mongoose.models.User.findOne({ vendorId: this.vendorId });
      if (existingVendor) {
        const newRandomDigits = Math.floor(100000 + Math.random() * 900000).toString();
        this.vendorId = `VEN${newRandomDigits}`;
      }
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
  USER_STATUS,
  VENDOR_CATEGORIES
}; 