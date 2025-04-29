/**
 * Send a successful response
 * @param {Object} res - Express response object
 * @param {Number} statusCode - HTTP status code (default: 200)
 * @param {String} message - Success message
 * @param {Object} data - Response data
 * @returns {Object} Express response
 */
const sendSuccess = (res, statusCode = 200, message = 'Success', data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

/**
 * Send an error response
 * @param {Object} res - Express response object
 * @param {Number} statusCode - HTTP status code (default: 500)
 * @param {String} message - Error message
 * @param {Object} errors - Error details
 * @returns {Object} Express response
 */
const sendError = (res, statusCode = 500, message = 'Internal Server Error', errors = null) => {
  const response = {
    success: false,
    message
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

/**
 * Handle API error and send appropriate response
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @returns {Object} Express response
 */
const handleApiError = (res, error) => {
  console.error('API Error:', error);

  // Custom error handling for different types of errors
  if (error.name === 'ValidationError') {
    // Mongoose validation error
    const errors = {};
    for (const field in error.errors) {
      errors[field] = error.errors[field].message;
    }
    return sendError(res, 400, 'Validation Error', errors);
  } 
  
  if (error.name === 'JsonWebTokenError') {
    return sendError(res, 401, 'Invalid token');
  }
  
  if (error.name === 'TokenExpiredError') {
    return sendError(res, 401, 'Token expired');
  }
  
  if (error.code === 11000) {
    // MongoDB duplicate key error
    const field = Object.keys(error.keyValue)[0];
    return sendError(res, 409, `Duplicate value for '${field}'`);
  }

  // Default error response
  return sendError(
    res, 
    error.statusCode || 500,
    error.message || 'Internal Server Error'
  );
};

/**
 * Add full URLs to file paths
 * @param {Object} obj - Object containing file paths
 * @param {string} baseUrl - Base URL for the server
 * @param {string[]} fields - Array of field names to check for file paths
 * @returns {Object} - Object with full URLs added
 */
const addFileUrls = (obj, baseUrl, fields = []) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const result = { ...obj };
  
  // If fields array is provided, only process those fields
  if (fields.length > 0) {
    fields.forEach(field => {
      if (result[field] && typeof result[field] === 'string' && !result[field].startsWith('http')) {
        result[`${field}Url`] = baseUrl + result[field];
      }
    });
    return result;
  }
  
  // Otherwise, process all string fields that look like file paths
  // This is a simple heuristic - adjust as needed
  Object.keys(result).forEach(key => {
    if (
      typeof result[key] === 'string' && 
      (result[key].startsWith('uploads/') || result[key].includes('/uploads/')) &&
      !key.endsWith('Url')
    ) {
      result[`${key}Url`] = baseUrl + result[key];
    } else if (typeof result[key] === 'object' && result[key] !== null) {
      // Recursively process nested objects
      result[key] = addFileUrls(result[key], baseUrl);
    }
  });
  
  return result;
};

module.exports = {
  sendSuccess,
  sendError,
  handleApiError,
  addFileUrls
}; 