const { sendError } = require('../utils/responseUtils');

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error status and message
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors = null;

  // Handle different types of errors
  if (err.name === 'ValidationError') {
    // Mongoose validation error
    statusCode = 400;
    message = 'Validation Error';
    errors = {};
    
    for (const field in err.errors) {
      errors[field] = err.errors[field].message;
    }
  } else if (err.name === 'CastError') {
    // Mongoose cast error (e.g., invalid ID)
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    // JWT errors
    statusCode = 401;
    message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
  } else if (err.code === 11000) {
    // MongoDB duplicate key error
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value for '${field}'`;
  } else if (err.statusCode) {
    // Custom error with status code
    statusCode = err.statusCode;
    message = err.message;
  }

  // Send error response
  return sendError(res, statusCode, message, errors);
};

/**
 * Not Found middleware for unmatched routes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const notFound = (req, res) => {
  return sendError(res, 404, `URL not found: ${req.originalUrl}`);
};

module.exports = {
  errorHandler,
  notFound
}; 