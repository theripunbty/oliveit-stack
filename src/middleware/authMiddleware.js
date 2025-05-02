const { authenticate, authorize } = require('./auth');

/**
 * Middleware to protect routes - requires authentication
 */
const protect = authenticate;

/**
 * Middleware to restrict access based on user role
 * @param {String|Array} roles - Allowed roles
 */
const restrictTo = authorize;

module.exports = {
  protect,
  restrictTo
}; 