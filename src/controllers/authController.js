const { User, USER_ROLES, USER_STATUS } = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwtUtils');
const { generateOTP, storeOTP, verifyOTP, sendOTP } = require('../utils/otpUtils');
const { getAddressFromCoordinates } = require('../utils/locationUtils');
const { sendSuccess, sendError, handleApiError } = require('../utils/responseUtils');
const redisClient = require('../config/redis');
const bcrypt = require('bcrypt');

/**
 * Register a new customer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const registerCustomer = async (req, res) => {
  try {
    const { phone, firstName, lastName } = req.body;

    // Validate required fields
    if (!phone) {
      return sendError(res, 400, 'Phone number is required');
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phone, role: USER_ROLES.CUSTOMER });
    
    if (existingUser) {
      return sendError(res, 409, 'Customer with this phone number already exists');
    }

    // Generate OTP and send to user
    const otp = generateOTP();
    await storeOTP(phone, otp);
    await sendOTP(phone, otp);

    // Store name data for registration completion
    if (firstName || lastName) {
      await redisClient.set(
        `customer_registration:${phone}`,
        JSON.stringify({ firstName, lastName }),
        'EX',
        1800 // Expire in 30 minutes
      );
    }

    return sendSuccess(res, 200, 'OTP sent successfully. Please verify your phone number.', { phone });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Register a new vendor
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const registerVendor = async (req, res) => {
  try {
    const { email, password, phone, firstName, lastName, location } = req.body;

    // Validate required fields
    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return sendError(res, 400, 'Valid location coordinates are required');
    }

    // Check if vendor already exists
    const existingUser = await User.findOne({ email, role: USER_ROLES.VENDOR });
    
    if (existingUser) {
      return sendError(res, 409, 'Vendor with this email already exists');
    }

    // Get location name from coordinates
    let locationName = '';
    try {
      const [longitude, latitude] = location.coordinates;
      const addressInfo = await getAddressFromCoordinates(latitude, longitude);
      locationName = addressInfo.fullAddress;
    } catch (error) {
      console.error('Error fetching location name:', error);
      // Continue with registration even if location name fetch fails
    }

    // Create new vendor
    const vendor = new User({
      role: USER_ROLES.VENDOR,
      email,
      password,
      phone,
      firstName,
      lastName,
      location: {
        type: 'Point',
        coordinates: location.coordinates,
        locationName
      },
      status: USER_STATUS.PENDING // Vendors require admin approval
    });

    await vendor.save();

    return sendSuccess(res, 201, 'Vendor registered successfully. Awaiting admin approval.', {
      vendor: {
        _id: vendor._id,
        email: vendor.email,
        role: vendor.role,
        status: vendor.status
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Register a new delivery agent
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const registerDeliveryAgent = async (req, res) => {
  try {
    const { phone, firstName, lastName, location } = req.body;

    // Validate required fields
    if (!phone) {
      return sendError(res, 400, 'Phone number is required');
    }

    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return sendError(res, 400, 'Valid location coordinates are required');
    }

    // Check if delivery agent already exists
    const existingUser = await User.findOne({ phone, role: USER_ROLES.DELIVERY });
    
    if (existingUser) {
      return sendError(res, 409, 'Delivery agent with this phone number already exists');
    }

    // Get location name from coordinates
    let locationName = '';
    try {
      const [longitude, latitude] = location.coordinates;
      const addressInfo = await getAddressFromCoordinates(latitude, longitude);
      locationName = addressInfo.fullAddress;
    } catch (error) {
      console.error('Error fetching location name:', error);
      // Continue with registration even if location name fetch fails
    }

    // Generate OTP and send to user for verification
    const otp = generateOTP();
    await storeOTP(phone, otp);
    await sendOTP(phone, otp);

    // Store delivery agent registration data in Redis for later completion after OTP verification
    const registrationData = {
      role: USER_ROLES.DELIVERY,
      phone,
      firstName,
      lastName,
      location: {
        type: 'Point',
        coordinates: location.coordinates,
        locationName
      },
      status: USER_STATUS.PENDING // Delivery agents require admin approval
    };

    await redisClient.set(
      `delivery_registration:${phone}`,
      JSON.stringify(registrationData),
      'EX',
      1800 // Expire in 30 minutes
    );

    return sendSuccess(res, 200, 'OTP sent successfully. Please verify your phone number.', { phone });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Register a new admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const registerAdmin = async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validate required fields
    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    // Check if admin already exists
    const existingUser = await User.findOne({ email, role: USER_ROLES.ADMIN });
    
    if (existingUser) {
      return sendError(res, 409, 'Admin with this email already exists');
    }

    // Create new admin
    const admin = new User({
      role: USER_ROLES.ADMIN,
      email,
      password, // Will be hashed in the pre-save hook
      firstName,
      lastName,
      status: USER_STATUS.ACTIVE
    });

    await admin.save();

    return sendSuccess(res, 201, 'Admin registered successfully', {
      admin: {
        _id: admin._id,
        email: admin.email,
        role: admin.role,
        status: admin.status
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Verify OTP and complete registration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyOTPAndRegister = async (req, res) => {
  try {
    const { phone, otp, role } = req.body;

    // Validate required fields
    if (!phone || !otp) {
      return sendError(res, 400, 'Phone number and OTP are required');
    }

    // Add debug logging to check role
    console.log('DEBUG: Received role:', role);
    console.log('DEBUG: Valid roles:', USER_ROLES);
    console.log('DEBUG: Role match test:', role === USER_ROLES.CUSTOMER ? 'Is customer' : 'Not customer');

    // Verify OTP
    const isValid = await verifyOTP(phone, otp);
    
    if (!isValid) {
      return sendError(res, 400, 'Invalid or expired OTP');
    }

    let user;

    // Handle registration based on role
    if (role === USER_ROLES.CUSTOMER) {
      // Generate a unique customer ID (6-8 digits)
      let customerId;
      let isUnique = false;
      const maxAttempts = 10;
      let attempts = 0;
      
      while (!isUnique && attempts < maxAttempts) {
        attempts++;
        // Generate a random number between 6-8 digits
        const digits = Math.floor(Math.random() * 3) + 6; // 6, 7, or 8 digits
        const minVal = Math.pow(10, digits - 1);
        const maxVal = Math.pow(10, digits) - 1;
        customerId = Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
        
        // Check if this ID is already in use
        const existingUser = await User.findOne({ customerId: customerId.toString() });
        if (!existingUser) {
          isUnique = true;
        }
      }
      
      if (!isUnique) {
        return sendError(res, 500, 'Failed to generate a unique customer ID. Please try again.');
      }

      // Get stored name data if available
      let firstName = '';
      let lastName = '';
      const registrationDataStr = await redisClient.get(`customer_registration:${phone}`);
      
      if (registrationDataStr) {
        try {
          const registrationData = JSON.parse(registrationDataStr);
          firstName = registrationData.firstName || '';
          lastName = registrationData.lastName || '';
          
          // Delete temporary registration data
          await redisClient.del(`customer_registration:${phone}`);
        } catch (error) {
          console.error('Error parsing customer registration data:', error);
          // Continue with registration even if parsing fails
        }
      }

      // For customers, create new user directly after OTP verification
      user = new User({
        role: USER_ROLES.CUSTOMER,
        phone,
        firstName,
        lastName,
        customerId: customerId.toString(),
        status: USER_STATUS.ACTIVE // Customers don't need approval
      });

      await user.save();
    } else if (role === USER_ROLES.DELIVERY) {
      // For delivery agents, retrieve stored registration data and create user
      const registrationDataStr = await redisClient.get(`delivery_registration:${phone}`);
      
      if (!registrationDataStr) {
        return sendError(res, 400, 'Registration data expired or not found');
      }

      const registrationData = JSON.parse(registrationDataStr);
      user = new User(registrationData);
      await user.save();

      // Delete temporary registration data
      await redisClient.del(`delivery_registration:${phone}`);
    } else {
      return sendError(res, 400, `Invalid or unsupported role for OTP verification. Received: "${role}" | Expected: "${USER_ROLES.CUSTOMER}" or "${USER_ROLES.DELIVERY}"`);
    }

    // Generate tokens for auto-login after registration (only for customers)
    let tokens = {};
    if (role === USER_ROLES.CUSTOMER) {
      tokens = {
        accessToken: generateAccessToken({ userId: user._id, role: user.role }),
        refreshToken: generateRefreshToken({ userId: user._id, role: user.role })
      };
      
      // Store refresh token with user
      user.refreshToken = tokens.refreshToken;
      await user.save();
    }

    return sendSuccess(res, 201, 'Registration successful', {
      user: {
        _id: user._id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        customerId: user.customerId,
        role: user.role,
        status: user.status
      },
      ...tokens
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Login using phone and OTP
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const loginWithOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const role = req.body.role || USER_ROLES.CUSTOMER; // Default to customer role

    // Validate required fields
    if (!phone) {
      return sendError(res, 400, 'Phone number is required');
    }

    // Check if user exists
    const user = await User.findOne({ phone, role });
    
    if (!user) {
      return sendError(res, 404, `No ${role} found with this phone number`);
    }

    // Check user status
    if (user.status === USER_STATUS.PENDING) {
      return sendError(res, 403, 'Your account is pending approval. Please wait for admin verification.');
    }

    if (user.status === USER_STATUS.REJECTED) {
      return sendError(res, 403, `Your account has been rejected. Reason: ${user.rejectionReason || 'Not specified'}`);
    }

    // Generate and send OTP
    const otp = generateOTP();
    await storeOTP(phone, otp);
    await sendOTP(phone, otp);

    return sendSuccess(res, 200, 'OTP sent successfully', { phone });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Verify OTP and complete login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyOTPAndLogin = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const role = req.body.role || USER_ROLES.CUSTOMER; // Default to customer role

    // Validate required fields
    if (!phone || !otp) {
      return sendError(res, 400, 'Phone number and OTP are required');
    }

    // Verify OTP
    const isValid = await verifyOTP(phone, otp);
    
    if (!isValid) {
      return sendError(res, 400, 'Invalid or expired OTP');
    }

    // Get user from database
    const user = await User.findOne({ phone, role });
    
    if (!user) {
      return sendError(res, 404, `No ${role} found with this phone number`);
    }

    // Check user status
    if (user.status !== USER_STATUS.ACTIVE) {
      return sendError(res, 403, `Your account is ${user.status}`);
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id, role: user.role });

    // Store refresh token with user
    user.refreshToken = refreshToken;
    await user.save();

    return sendSuccess(res, 200, 'Login successful', {
      user: {
        _id: user._id,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Login with email and password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const loginWithPassword = async (req, res) => {
  try {
    const { email, password } = req.body;
    const role = req.body.role || USER_ROLES.VENDOR; // Default to vendor role

    // Validate required fields
    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    // Find user by email and role
    const user = await User.findOne({ email, role });
    
    if (!user) {
      return sendError(res, 404, `No ${role} found with this email`);
    }

    // Check if account is active
    if (user.status === USER_STATUS.PENDING) {
      return sendError(res, 403, 'Your account is pending approval. Please wait for admin verification.');
    }

    if (user.status === USER_STATUS.REJECTED) {
      return sendError(res, 403, `Your account has been rejected. Reason: ${user.rejectionReason || 'Not specified'}`);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return sendError(res, 401, 'Invalid password');
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id, role: user.role });

    // Store refresh token with user
    user.refreshToken = refreshToken;
    await user.save();

    return sendSuccess(res, 200, 'Login successful', {
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Login admin
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    // Check against environment variables first for the default admin
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      // Check if default admin exists in DB, if not create one
      let adminUser = await User.findOne({ role: USER_ROLES.ADMIN, email });
      
      if (!adminUser) {
        // Create default admin user
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        adminUser = await User.create({
          role: USER_ROLES.ADMIN,
          email,
          password: hashedPassword,
          status: USER_STATUS.ACTIVE,
          firstName: 'Admin',
          lastName: 'User'
        });
      }

      // Generate tokens
      const accessToken = generateAccessToken({ userId: adminUser._id, role: adminUser.role });
      const refreshToken = generateRefreshToken({ userId: adminUser._id, role: adminUser.role });

      // Store refresh token with user
      adminUser.refreshToken = refreshToken;
      await adminUser.save();

      return sendSuccess(res, 200, 'Admin login successful', {
        user: {
          _id: adminUser._id,
          email: adminUser.email,
          role: adminUser.role
        },
        accessToken,
        refreshToken
      });
    }

    // If not default admin, check DB
    const adminUser = await User.findOne({ role: USER_ROLES.ADMIN, email });
    
    if (!adminUser) {
      return sendError(res, 404, 'Admin not found');
    }

    // Verify password
    const isPasswordValid = await adminUser.comparePassword(password);
    
    if (!isPasswordValid) {
      return sendError(res, 401, 'Invalid password');
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: adminUser._id, role: adminUser.role });
    const refreshToken = generateRefreshToken({ userId: adminUser._id, role: adminUser.role });

    // Store refresh token with user
    adminUser.refreshToken = refreshToken;
    await adminUser.save();

    return sendSuccess(res, 200, 'Admin login successful', {
      user: {
        _id: adminUser._id,
        email: adminUser.email,
        role: adminUser.role
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Refresh access token using refresh token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      return sendError(res, 400, 'Refresh token is required');
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(token);
    
    // Get user from database
    const user = await User.findById(decoded.userId);
    
    if (!user || user.refreshToken !== token) {
      return sendError(res, 401, 'Invalid refresh token');
    }

    // Generate new tokens
    const accessToken = generateAccessToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user._id, role: user.role });

    // Update refresh token in database
    user.refreshToken = refreshToken;
    await user.save();

    return sendSuccess(res, 200, 'Token refreshed successfully', {
      accessToken,
      refreshToken
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 401, 'Refresh token expired, please log in again');
    }
    return handleApiError(res, error);
  }
};

/**
 * Logout user and invalidate refresh token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const logout = async (req, res) => {
  try {
    const userId = req.user._id;

    // Clear refresh token from database
    await User.findByIdAndUpdate(userId, { refreshToken: null });

    return sendSuccess(res, 200, 'Logged out successfully');
  } catch (error) {
    return handleApiError(res, error);
  }
};

module.exports = {
  registerCustomer,
  registerVendor,
  registerDeliveryAgent,
  registerAdmin,
  verifyOTPAndRegister,
  loginWithOTP,
  verifyOTPAndLogin,
  loginWithPassword,
  loginAdmin,
  refreshToken,
  logout
}; 