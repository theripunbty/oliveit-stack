const mongoose = require('mongoose');
const AdminAuditLog = require('../models/AdminAuditLog');
const { sendError } = require('../utils/responseUtils');

/**
 * Middleware to log admin actions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const logAdminAction = (req, res, next) => {
  // Store original end method
  const originalEnd = res.end;
  
  // Replace end method with custom implementation
  res.end = function(chunk, encoding) {
    // Call original end method
    originalEnd.call(this, chunk, encoding);
    
    try {
      // Skip logging for GET requests (read-only)
      if (req.method === 'GET') {
        return;
      }
      
      // Don't log auth-related routes
      if (req.path.includes('/auth/')) {
        return;
      }
      
      // Extract action based on method
      let action;
      switch (req.method) {
        case 'POST': action = 'CREATE'; break;
        case 'PUT': action = 'UPDATE'; break;
        case 'DELETE': action = 'DELETE'; break;
        default: action = 'OTHER';
      }
      
      // Special cases for approving/rejecting
      if (req.path.includes('/approve')) {
        action = 'APPROVE';
      } else if (req.path.includes('/reject')) {
        action = 'REJECT';
      }
      
      // Extract entity type from path
      let entity;
      if (req.path.includes('/vendors')) {
        entity = 'VENDOR';
      } else if (req.path.includes('/delivery-agents')) {
        entity = 'DELIVERY_AGENT';
      } else if (req.path.includes('/customers')) {
        entity = 'CUSTOMER';
      } else if (req.path.includes('/orders')) {
        entity = 'ORDER';
      } else if (req.path.includes('/categories')) {
        entity = 'CATEGORY';
      } else if (req.path.includes('/faqs')) {
        entity = 'FAQ';
      } else if (req.path.includes('/banners')) {
        entity = 'BANNER';
      } else if (req.path.includes('/settings')) {
        entity = 'SETTINGS';
      } else {
        entity = 'OTHER';
      }
      
      // Extract entityId if available
      let entityId = null;
      const pathParts = req.path.split('/');
      
      // Find the ID in the path (assuming it's a MongoDB ObjectId)
      for (let i = 0; i < pathParts.length; i++) {
        if (mongoose.Types.ObjectId.isValid(pathParts[i])) {
          entityId = pathParts[i];
          break;
        }
      }
      
      // Create audit log entry
      const log = new AdminAuditLog({
        adminId: req.user._id,
        action,
        entity,
        entityId,
        details: {
          method: req.method,
          path: req.path,
          body: req.body,
          params: req.params,
          query: req.query
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      // Save log asynchronously (don't wait for completion)
      log.save().catch(err => console.error('Audit log error:', err));
    } catch (error) {
      console.error('Error in audit logging:', error);
    }
  };
  
  next();
};

/**
 * Controller function to get admin audit logs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAdminAuditLogs = async (req, res) => {
  try {
    const { adminId, action, entity, startDate, endDate, page = 1, limit = 10 } = req.query;
    
    // Build query
    const query = {};
    
    if (adminId) query.adminId = adminId;
    if (action) query.action = action;
    if (entity) query.entity = entity;
    
    // Date filtering
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    // Set pagination options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { timestamp: -1 },
      populate: {
        path: 'adminId',
        select: 'firstName lastName email'
      }
    };
    
    // Get paginated results
    const logs = await AdminAuditLog.paginate(query, options);
    
    return res.status(200).json({
      success: true,
      data: logs.docs,
      pagination: {
        total: logs.totalDocs,
        limit: logs.limit,
        page: logs.page,
        pages: logs.totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};

module.exports = { logAdminAction, getAdminAuditLogs }; 