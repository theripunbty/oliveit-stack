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
    const { 
      fullName,
      phone, 
      email,
      username,
      password,
      location,
      storeDetails,
      legalDocuments,
      bankDetails,
      upiDetails
    } = req.body;

    // Validate required fields
    if (!fullName || !phone || !email || !username || !password) {
      return sendError(res, 400, 'All required fields must be provided');
    }

    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return sendError(res, 400, 'Valid location coordinates are required');
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return sendError(res, 409, 'Username already exists');
    }

    // Check if email already exists for vendors
    const existingEmail = await User.findOne({ email, role: USER_ROLES.VENDOR });
    if (existingEmail) {
      return sendError(res, 409, 'Vendor with this email already exists');
    }

    // Check if phone already exists for vendors
    const existingPhone = await User.findOne({ phone, role: USER_ROLES.VENDOR });
    if (existingPhone) {
      return sendError(res, 409, 'Vendor with this phone number already exists');
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

    // Process file paths from request
    const profileImage = req.files && req.files.profileImage ? req.files.profileImage[0].path : null;
    const storePhoto = req.files && req.files.storePhoto ? req.files.storePhoto[0].path : null;
    const aadhaarPhoto = req.files && req.files.aadhaarPhoto ? req.files.aadhaarPhoto[0].path : null;
    const panPhoto = req.files && req.files.panPhoto ? req.files.panPhoto[0].path : null;

    // Create new vendor
    const vendor = new User({
      role: USER_ROLES.VENDOR,
      fullName,
      phone,
      email,
      username,
      password,
      profileImage,
      location: {
        type: 'Point',
        coordinates: location.coordinates,
        locationName
      },
      storeDetails: {
        storeName: storeDetails?.storeName,
        storeAddress: storeDetails?.storeAddress,
        storeCategory: storeDetails?.storeCategory,
        storePhoto,
        businessEntityType: storeDetails?.businessEntityType
      },
      legalDocuments: {
        aadhaarNumber: legalDocuments?.aadhaarNumber,
        aadhaarPhoto,
        panNumber: legalDocuments?.panNumber,
        panPhoto,
        gstinNumber: legalDocuments?.gstinNumber,
        fssaiNumber: legalDocuments?.fssaiNumber
      },
      bankDetails: {
        accountNumber: bankDetails?.accountNumber,
        ifscCode: bankDetails?.ifscCode,
        accountHolderName: bankDetails?.accountHolderName
      },
      upiDetails: {
        upiId: upiDetails?.upiId,
        preferredApp: upiDetails?.preferredApp
      },
      status: USER_STATUS.PENDING // Vendors require admin approval
    });

    await vendor.save();

    return sendSuccess(res, 201, 'Registration successful! Your application is under review and you will be notified once approved. You will be able to login using your username and password after approval.', {
      vendor: {
        _id: vendor._id,
        vendorId: vendor.vendorId,
        fullName: vendor.fullName,
        email: vendor.email,
        phone: vendor.phone,
        username: vendor.username,
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
    const { email, password, firstName, lastName, phone } = req.body;

    // Validate required fields
    if (!email || !password || !phone) {
      return sendError(res, 400, 'Email, password, and phone are required');
    }

    // Validate phone number
    if (!/^\d{10}$/.test(phone)) {
      return sendError(res, 400, 'Phone number must be 10 digits');
    }

    // Check if admin already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email, role: USER_ROLES.ADMIN },
        { phone, role: USER_ROLES.ADMIN }
      ]
    });
    
    if (existingUser) {
      return sendError(res, 409, 'Admin with this email or phone already exists');
    }

    // Create new admin
    const admin = new User({
      role: USER_ROLES.ADMIN,
      email,
      phone,
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
        phone: admin.phone,
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
      return sendError(res, 403, 'Your application is under review. You will be notified once approved. Thank you for your patience.');
    }

    if (user.status === USER_STATUS.REJECTED) {
      return sendError(res, 403, `Your application has been declined. Reason: ${user.rejectionReason || 'Not specified'}. Please contact support for more information.`);
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
      return sendError(res, 403, 'Your application is under review. You will be notified once approved. Thank you for your patience.');
    }

    if (user.status === USER_STATUS.REJECTED) {
      return sendError(res, 403, `Your application has been declined. Reason: ${user.rejectionReason || 'Not specified'}. Please contact support for more information.`);
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
    const { email, password, phone } = req.body;

    // Validate required fields - either email or phone is required
    if ((!email && !phone) || !password) {
      return sendError(res, 400, 'Either email or phone, and password are required');
    }

    // Check against environment variables first for the default admin (email only)
    if (email && email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      // Check if default admin exists in DB, if not create one
      let adminUser = await User.findOne({ role: USER_ROLES.ADMIN, email });
      
      if (!adminUser) {
        // Create default admin user
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Generate a default phone number if not provided
        const defaultPhone = process.env.ADMIN_PHONE || '0000000000';
        
        adminUser = await User.create({
          role: USER_ROLES.ADMIN,
          email,
          phone: defaultPhone,
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
          phone: adminUser.phone,
          role: adminUser.role
        },
        accessToken,
        refreshToken
      });
    }

    // If not default admin, check DB
    let query = { role: USER_ROLES.ADMIN };
    if (email) {
      query.email = email;
    } else if (phone) {
      query.phone = phone;
    }
    
    const adminUser = await User.findOne(query);
    
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
        phone: adminUser.phone,
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

/**
 * Verify OTP and complete vendor registration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyOTPAndRegisterVendor = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // Validate required fields
    if (!phone || !otp) {
      return sendError(res, 400, 'Phone number and OTP are required');
    }

    // Verify OTP
    const isOTPValid = await verifyOTP(phone, otp);
    if (!isOTPValid) {
      return sendError(res, 400, 'Invalid or expired OTP');
    }

    // Get pending registration data
    const registrationData = await redisClient.get(`vendor_registration:${phone}`);
    if (!registrationData) {
      return sendError(res, 400, 'Registration session expired. Please start again.');
    }

    const { fullName, location } = JSON.parse(registrationData);

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
      phone,
      fullName,
      location: {
        type: 'Point',
        coordinates: location.coordinates,
        locationName
      },
      status: USER_STATUS.PENDING // Vendors require admin approval
    });

    await vendor.save();

    // Clean up Redis data
    await redisClient.del(`vendor_registration:${phone}`);

    return sendSuccess(res, 201, 'Registration successful! Your application is under review and you will be notified once approved. You will be able to login using your username and password after approval.', {
      vendor: {
        _id: vendor._id,
        vendorId: vendor.vendorId,
        fullName: vendor.fullName,
        email: vendor.email,
        phone: vendor.phone,
        username: vendor.username,
        role: vendor.role,
        status: vendor.status
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Send OTP for vendor login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const loginVendorSendOTP = async (req, res) => {
  try {
    const { phone } = req.body;

    // Validate required fields
    if (!phone) {
      return sendError(res, 400, 'Phone number is required');
    }

    // Find vendor by phone
    const vendor = await User.findOne({ phone, role: USER_ROLES.VENDOR });
    
    if (!vendor) {
      return sendError(res, 404, 'No vendor found with this phone number');
    }

    // Check if account is active
    if (vendor.status === USER_STATUS.PENDING) {
      return sendError(res, 403, 'Your application is under review. You will be notified once approved. Thank you for your patience.');
    }

    if (vendor.status === USER_STATUS.REJECTED) {
      return sendError(res, 403, `Your application has been declined. Reason: ${vendor.rejectionReason || 'Not specified'}. Please contact support for more information.`);
    }

    // Generate OTP and send to user
    const otp = generateOTP();
    await storeOTP(phone, otp);
    await sendOTP(phone, otp);

    return sendSuccess(res, 200, 'OTP sent successfully', { phone });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Verify OTP and login vendor
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const verifyOTPAndLoginVendor = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    // Validate required fields
    if (!phone || !otp) {
      return sendError(res, 400, 'Phone number and OTP are required');
    }

    // Verify OTP
    const isOTPValid = await verifyOTP(phone, otp);
    if (!isOTPValid) {
      return sendError(res, 400, 'Invalid or expired OTP');
    }

    // Find vendor by phone
    const vendor = await User.findOne({ phone, role: USER_ROLES.VENDOR });
    
    if (!vendor) {
      return sendError(res, 404, 'No vendor found with this phone number');
    }

    // Check if account is active
    if (vendor.status === USER_STATUS.PENDING) {
      return sendError(res, 403, 'Your application is under review. You will be notified once approved. Thank you for your patience.');
    }

    if (vendor.status === USER_STATUS.REJECTED) {
      return sendError(res, 403, `Your application has been declined. Reason: ${vendor.rejectionReason || 'Not specified'}. Please contact support for more information.`);
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: vendor._id, role: vendor.role });
    const refreshToken = generateRefreshToken({ userId: vendor._id, role: vendor.role });

    // Store refresh token with user
    vendor.refreshToken = refreshToken;
    await vendor.save();

    return sendSuccess(res, 200, 'Login successful', {
      user: {
        _id: vendor._id,
        phone: vendor.phone,
        vendorId: vendor.vendorId,
        fullName: vendor.fullName,
        role: vendor.role
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Login vendor with username and password
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const loginVendor = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate required fields
    if (!username || !password) {
      return sendError(res, 400, 'Username and password are required');
    }

    // Find vendor by username
    const vendor = await User.findOne({ username, role: USER_ROLES.VENDOR });
    
    if (!vendor) {
      return sendError(res, 404, 'No vendor found with this username');
    }

    // Check if account is active
    if (vendor.status === USER_STATUS.PENDING) {
      return sendError(res, 403, 'Your application is under review. You will be notified once approved. Thank you for your patience.');
    }

    if (vendor.status === USER_STATUS.REJECTED) {
      return sendError(res, 403, `Your application has been declined. Reason: ${vendor.rejectionReason || 'Not specified'}. Please contact support for more information.`);
    }

    // Verify password
    const isPasswordValid = await vendor.comparePassword(password);
    
    if (!isPasswordValid) {
      return sendError(res, 401, 'Invalid password');
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: vendor._id, role: vendor.role });
    const refreshToken = generateRefreshToken({ userId: vendor._id, role: vendor.role });

    // Store refresh token with user
    vendor.refreshToken = refreshToken;
    await vendor.save();

    return sendSuccess(res, 200, 'Login successful', {
      user: {
        _id: vendor._id,
        vendorId: vendor.vendorId,
        fullName: vendor.fullName,
        email: vendor.email,
        phone: vendor.phone,
        username: vendor.username,
        role: vendor.role
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Forgot password - send reset token via email
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const role = req.body.role || USER_ROLES.VENDOR; // Default to vendor role

    // Validate required fields
    if (!email) {
      return sendError(res, 400, 'Email is required');
    }

    // Find user by email
    const user = await User.findOne({ email, role });
    
    if (!user) {
      return sendError(res, 404, `No ${role} found with this email`);
    }

    // Generate random reset token (6 digit number)
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set token expiry (30 minutes)
    const resetTokenExpiry = Date.now() + 30 * 60 * 1000;
    
    // Store reset token in Redis with expiry
    await redisClient.set(
      `reset_token:${user._id}`,
      JSON.stringify({ resetToken, resetTokenExpiry }),
      'EX',
      1800 // Expire in 30 minutes
    );

    // For vendors, include the username in the response
    let responseMessage = 'Password reset token sent to your email';
    if (role === USER_ROLES.VENDOR) {
      responseMessage = `Password reset token sent to your email. After resetting, you will login with username '${user.username}' and your new password.`;
    }

    // TODO: Implement actual email sending here
    // For now, we'll simply log it to console
    console.log(`[SIMULATED EMAIL] Password reset token for ${email}: ${resetToken}`);

    return sendSuccess(res, 200, responseMessage);
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Reset password using token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const resetPassword = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    const role = req.body.role || USER_ROLES.VENDOR; // Default to vendor role

    // Validate required fields
    if (!email || !resetToken || !newPassword) {
      return sendError(res, 400, 'Email, reset token and new password are required');
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return sendError(res, 400, 'Password must be at least 8 characters long');
    }

    // Find user by email
    const user = await User.findOne({ email, role });
    
    if (!user) {
      return sendError(res, 404, `No ${role} found with this email`);
    }

    // Get reset token from Redis
    const tokenData = await redisClient.get(`reset_token:${user._id}`);
    
    if (!tokenData) {
      return sendError(res, 400, 'Reset token is invalid or expired');
    }

    const { resetToken: storedToken, resetTokenExpiry } = JSON.parse(tokenData);
    
    // Check if token matches and is not expired
    if (resetToken !== storedToken || Date.now() > resetTokenExpiry) {
      return sendError(res, 400, 'Reset token is invalid or expired');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Delete reset token from Redis
    await redisClient.del(`reset_token:${user._id}`);

    let successMessage = 'Password has been reset successfully';
    if (role === USER_ROLES.VENDOR) {
      successMessage = `Password has been reset successfully. Remember to login with your username '${user.username}' and your new password.`;
    }

    return sendSuccess(res, 200, successMessage);
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get user location based on user role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getUserLocation = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    
    // Try to get from Redis first (most up-to-date) based on role
    let redisKey = '';
    if (userRole === USER_ROLES.CUSTOMER) {
      redisKey = `customer_location:${userId}`;
    } else if (userRole === USER_ROLES.DELIVERY) {
      redisKey = `delivery_location:${userId}`;
    } else if (userRole === USER_ROLES.VENDOR) {
      redisKey = `vendor_location:${userId}`;
    }
    
    if (redisKey) {
      const redisLocation = await redisClient.get(redisKey);
      if (redisLocation) {
        const locationData = JSON.parse(redisLocation);
        return sendSuccess(res, 200, 'Location retrieved successfully', { location: locationData });
      }
    }
    
    // If not in Redis, get from database
    const user = await User.findById(userId).select('location role');
    
    if (!user) {
      return sendError(res, 404, 'User not found');
    }
    
    return sendSuccess(res, 200, 'Location retrieved successfully', { 
      location: user.location,
      role: user.role
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update user location based on user role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateUserLocation = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const { coordinates } = req.body;
    
    // Validate coordinates
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return sendError(res, 400, 'Valid coordinates are required [longitude, latitude]');
    }
    
    // Get location name from coordinates
    let locationName = '';
    try {
      const [longitude, latitude] = coordinates;
      const addressInfo = await getAddressFromCoordinates(latitude, longitude);
      locationName = addressInfo.fullAddress;
    } catch (error) {
      console.error('Error fetching location name:', error);
      // Continue with location update even if location name fetch fails
    }
    
    // Update location in database
    const user = await User.findByIdAndUpdate(
      userId,
      {
        location: {
          type: 'Point',
          coordinates,
          locationName
        }
      },
      { new: true }
    ).select('location role');
    
    if (!user) {
      return sendError(res, 404, 'User not found');
    }
    
    // Determine the appropriate Redis key based on user role
    let redisKey = '';
    if (userRole === USER_ROLES.CUSTOMER) {
      redisKey = `customer_location:${userId}`;
    } else if (userRole === USER_ROLES.DELIVERY) {
      redisKey = `delivery_location:${userId}`;
    } else if (userRole === USER_ROLES.VENDOR) {
      redisKey = `vendor_location:${userId}`;
    }
    
    // Store in Redis for real-time access
    if (redisKey) {
      await redisClient.set(
        redisKey,
        JSON.stringify({
          userId,
          coordinates,
          locationName,
          role: userRole,
          updatedAt: new Date()
        }),
        'EX',
        300 // Expire in 5 minutes if not updated
      );
    }
    
    return sendSuccess(res, 200, 'Location updated successfully', { 
      location: user.location,
      role: user.role
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Check if username is available
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const checkUsernameAvailability = async (req, res) => {
  try {
    const { username } = req.body;

    // Validate username format
    if (!username || !/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
      return sendError(res, 400, 'Username must be 4-20 characters (letters, numbers, underscore)');
    }

    // Check if username already exists
    const existingUsername = await User.findOne({ username });
    
    if (existingUsername) {
      return sendSuccess(res, 200, 'Username is not available', { available: false });
    }

    return sendSuccess(res, 200, 'Username is available', { available: true });
  } catch (error) {
    return handleApiError(res, error);
  }
};

module.exports = {
  registerCustomer,
  registerVendor,
  registerVendorInitial: registerVendor, // Alias for backward compatibility if needed
  registerDeliveryAgent,
  registerDeliveryAgentInitial: registerDeliveryAgent, // Alias for backward compatibility if needed
  registerAdmin,
  verifyOTPAndRegister,
  verifyOTPAndRegisterVendor,
  loginWithOTP,
  verifyOTPAndLogin,
  loginWithPassword,
  loginAdmin,
  loginVendor,
  loginVendorSendOTP,
  verifyOTPAndLoginVendor,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getUserLocation,
  updateUserLocation,
  checkUsernameAvailability
}; 