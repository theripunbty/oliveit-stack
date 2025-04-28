const { verifyAccessToken } = require('../utils/jwtUtils');
const { User, USER_ROLES, USER_STATUS } = require('../models/User');
const { sendError } = require('../utils/responseUtils');

/**
 * Authenticate user using JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 401, 'Access denied. No token provided');
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = verifyAccessToken(token);
    
    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return sendError(res, 401, 'Invalid token, user not found');
    }
    
    // Check if user is active
    if (user.status !== USER_STATUS.ACTIVE) {
      return sendError(res, 403, `Account is ${user.status}. Please contact support.`);
    }
    
    // Add user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendError(res, 401, 'Token expired');
    }
    return sendError(res, 401, 'Invalid token');
  }
};

/**
 * Check if user has required role
 * @param {Array|String} roles - Allowed roles
 * @returns {Function} Middleware function
 */
const authorize = (roles) => {
  // Convert single role to array
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Authentication required');
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, 403, 'Access denied. Insufficient permissions');
    }
    
    next();
  };
};

// Role-specific middleware
const isCustomer = authorize(USER_ROLES.CUSTOMER);
const isVendor = authorize(USER_ROLES.VENDOR);
const isDeliveryAgent = authorize(USER_ROLES.DELIVERY);
const isAdmin = authorize(USER_ROLES.ADMIN);

module.exports = {
  authenticate,
  authorize,
  isCustomer,
  isVendor,
  isDeliveryAgent,
  isAdmin
}; 