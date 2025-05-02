const { User, USER_ROLES, USER_STATUS } = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { Order, ORDER_STATUS, PAYMENT_STATUS } = require('../models/Order');
const { sendSuccess, sendError, handleApiError } = require('../utils/responseUtils');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const FAQ = require('../models/FAQ');
const Banner = require('../models/Banner');
const AdminAuditLog = require('../models/AdminAuditLog');
const SystemSetting = require('../models/SystemSetting');

/**
 * Get all vendors with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getVendors = async (req, res) => {
  try {
    const { status, search, limit = 10, page = 1 } = req.query;
    
    // Build query
    const query = { role: USER_ROLES.VENDOR };
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get vendors
    const vendors = await User.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalVendors = await User.countDocuments(query);
    
    return sendSuccess(res, 200, 'Vendors retrieved successfully', {
      vendors,
      pagination: {
        totalVendors,
        totalPages: Math.ceil(totalVendors / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get vendor details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getVendorDetails = async (req, res) => {
  try {
    const vendorId = req.params.id;
    
    // Get vendor details
    const vendor = await User.findOne({
      _id: vendorId,
      role: USER_ROLES.VENDOR
    }).select('-password -refreshToken');
    
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }
    
    // Get vendor's products count
    const productsCount = await Product.countDocuments({ vendor: vendorId });
    
    // Get vendor's orders count
    const ordersCount = await Order.countDocuments({ vendor: vendorId });
    
    // Get vendor's total revenue
    const revenueData = await Order.aggregate([
      {
        $match: {
          vendor: mongoose.Types.ObjectId(vendorId),
          status: ORDER_STATUS.DELIVERED
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$subtotal' }
        }
      }
    ]);
    
    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;
    
    // Create URLs for all vendor documents
    const baseUrl = `${req.protocol}://${req.get('host')}/`;
    
    const vendorData = vendor.toObject();
    
    // Add URLs for profile image
    if (vendorData.profileImage) {
      vendorData.profileImageUrl = baseUrl + vendorData.profileImage;
    }
    
    // Add URLs for store photo
    if (vendorData.storeDetails && vendorData.storeDetails.storePhoto) {
      vendorData.storeDetails.storePhotoUrl = baseUrl + vendorData.storeDetails.storePhoto;
    }
    
    // Add URLs for legal documents
    if (vendorData.legalDocuments) {
      if (vendorData.legalDocuments.aadhaarPhoto) {
        vendorData.legalDocuments.aadhaarPhotoUrl = baseUrl + vendorData.legalDocuments.aadhaarPhoto;
      }
      if (vendorData.legalDocuments.panPhoto) {
        vendorData.legalDocuments.panPhotoUrl = baseUrl + vendorData.legalDocuments.panPhoto;
      }
    }
    
    // Add URLs for KYC documents
    if (vendorData.kycDocuments && vendorData.kycDocuments.length > 0) {
      vendorData.kycDocuments = vendorData.kycDocuments.map(doc => {
        if (doc.documentUrl) {
          return {
            ...doc,
            documentFullUrl: baseUrl + doc.documentUrl
          };
        }
        return doc;
      });
    }
    
    return sendSuccess(res, 200, 'Vendor details retrieved successfully', {
      vendor: vendorData,
      stats: {
        productsCount,
        ordersCount,
        totalRevenue
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Find vendor by formatted vendorId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const findVendorByFormattedId = async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    // Validate the format of vendorId
    if (!vendorId.match(/^VEN\d{6,8}$/)) {
      return sendError(res, 400, 'Invalid vendor ID format. Must be VEN followed by 6-8 digits');
    }
    
    // Find vendor by vendorId field
    const vendor = await User.findOne({
      vendorId: vendorId,
      role: USER_ROLES.VENDOR
    }).select('-password -refreshToken');
    
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }
    
    // Create URLs for profile image
    const baseUrl = `${req.protocol}://${req.get('host')}/`;
    const vendorData = vendor.toObject();
    
    // Add URL for profile image
    if (vendorData.profileImage) {
      vendorData.profileImageUrl = baseUrl + vendorData.profileImage;
    }
    
    // Add URL for store photo
    if (vendorData.storeDetails && vendorData.storeDetails.storePhoto) {
      vendorData.storeDetails.storePhotoUrl = baseUrl + vendorData.storeDetails.storePhoto;
    }
    
    return sendSuccess(res, 200, 'Vendor found successfully', { vendor: vendorData });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Approve a vendor
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const approveVendor = async (req, res) => {
  try {
    const vendorId = req.params.id;
    
    // Find vendor
    const vendor = await User.findOne({
      _id: vendorId,
      role: USER_ROLES.VENDOR,
      status: USER_STATUS.PENDING
    });
    
    if (!vendor) {
      return sendError(res, 404, 'Pending vendor not found');
    }
    
    // Update vendor status
    vendor.status = USER_STATUS.ACTIVE;
    await vendor.save();
    
    // Send notification (placeholder for actual implementation)
    console.log(`Vendor ${vendorId} approved. Send notification to ${vendor.email}`);
    
    return sendSuccess(res, 200, 'Vendor approved successfully', { vendor });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Reject a vendor
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const rejectVendor = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const { reason } = req.body;
    
    if (!reason) {
      return sendError(res, 400, 'Rejection reason is required');
    }
    
    // Find vendor
    const vendor = await User.findOne({
      _id: vendorId,
      role: USER_ROLES.VENDOR,
      status: USER_STATUS.PENDING
    });
    
    if (!vendor) {
      return sendError(res, 404, 'Pending vendor not found');
    }
    
    // Update vendor status
    vendor.status = USER_STATUS.REJECTED;
    vendor.rejectionReason = reason;
    await vendor.save();
    
    // Send notification (placeholder for actual implementation)
    console.log(`Vendor ${vendorId} rejected. Send notification to ${vendor.email}`);
    
    // Log admin action
    await new AdminAuditLog({
      adminId: req.user._id,
      action: 'VENDOR_REJECTED',
      details: {
        vendorId: vendor._id,
        reason: reason
      }
    }).save();
    
    return sendSuccess(res, 200, 'Vendor rejected successfully', { vendor });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Delete a vendor permanently
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteVendor = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const { deleteUser = false } = req.body; // Get deleteUser flag from request body
    console.log(`deleteVendor called with ID: ${vendorId}, deleteUser: ${deleteUser}`);
    
    // Find vendor
    const vendor = await User.findOne({
      _id: vendorId,
      role: USER_ROLES.VENDOR
    });
    
    if (!vendor) {
      console.log(`Vendor not found with ID: ${vendorId}`);
      return sendError(res, 404, 'Vendor not found');
    }
    
    console.log(`Found vendor: ${vendor.firstName} ${vendor.lastName}, Email: ${vendor.email}`);
    
    // Check if vendor has associated products
    const productsCount = await Product.countDocuments({ vendor: vendorId });
    console.log(`Vendor has ${productsCount} associated products`);
    
    if (productsCount > 0) {
      return sendError(res, 400, 'Cannot delete vendor with associated products. Please delete or reassign the products first.');
    }
    
    // Check if vendor has associated orders
    const ordersCount = await Order.countDocuments({ vendor: vendorId });
    console.log(`Vendor has ${ordersCount} associated orders`);
    
    if (ordersCount > 0) {
      return sendError(res, 400, 'Cannot delete vendor with associated orders. Please consider deactivating the vendor instead.');
    }
    
    let result;
    if (deleteUser) {
      // Delete both vendor and user account
      console.log(`Deleting vendor and user account for ID: ${vendorId}`);
      result = await User.findByIdAndDelete(vendorId);
      console.log(`Vendor and user delete result:`, result);
    } else {
      // Keep the user account but convert to customer role
      console.log(`Converting vendor to customer for ID: ${vendorId}`);
      vendor.role = USER_ROLES.CUSTOMER;
      vendor.status = USER_STATUS.ACTIVE;
      vendor.vendorId = undefined; // Remove vendor ID
      
      // Remove vendor-specific fields
      vendor.storeDetails = undefined;
      vendor.bankDetails = undefined;
      vendor.upiDetails = undefined;
      vendor.kycDocuments = [];
      
      // Save the updated user
      result = await vendor.save();
      console.log(`Vendor converted to customer:`, result);
    }
    
    // Log admin action
    await new AdminAuditLog({
      adminId: req.user._id,
      action: 'DELETE',
      entity: 'VENDOR',
      entityId: vendor._id.toString(),
      details: {
        vendorId: vendor._id,
        vendorEmail: vendor.email,
        vendorName: `${vendor.firstName} ${vendor.lastName}`,
        deleteUserAccount: deleteUser
      }
    }).save();
    
    const message = deleteUser 
      ? 'Vendor and user account deleted successfully' 
      : 'Vendor deleted and converted to customer successfully';
    
    return sendSuccess(res, 200, message);
  } catch (error) {
    console.error('Error in deleteVendor:', error);
    return handleApiError(res, error);
  }
};

/**
 * Get all delivery agents with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDeliveryAgents = async (req, res) => {
  try {
    const { status, search, limit = 10, page = 1 } = req.query;
    
    // Build query
    const query = { role: USER_ROLES.DELIVERY };
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { phone: searchRegex }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get delivery agents
    const deliveryAgents = await User.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalDeliveryAgents = await User.countDocuments(query);
    
    return sendSuccess(res, 200, 'Delivery agents retrieved successfully', {
      deliveryAgents,
      pagination: {
        totalDeliveryAgents,
        totalPages: Math.ceil(totalDeliveryAgents / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get delivery agent details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDeliveryAgentDetails = async (req, res) => {
  try {
    const deliveryAgentId = req.params.id;
    
    // Get delivery agent details
    const deliveryAgent = await User.findOne({
      _id: deliveryAgentId,
      role: USER_ROLES.DELIVERY
    }).select('-password -refreshToken');
    
    if (!deliveryAgent) {
      return sendError(res, 404, 'Delivery agent not found');
    }
    
    // Get delivery agent's orders count
    const deliveredOrdersCount = await Order.countDocuments({
      deliveryAgent: deliveryAgentId,
      status: ORDER_STATUS.DELIVERED
    });
    
    // Get delivery agent's total earnings
    const earningsData = await Order.aggregate([
      {
        $match: {
          deliveryAgent: deliveryAgent._id,
          status: ORDER_STATUS.DELIVERED
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$deliveryFee' }
        }
      }
    ]);
    
    const totalEarnings = earningsData.length > 0 ? earningsData[0].totalEarnings : 0;
    
    return sendSuccess(res, 200, 'Delivery agent details retrieved successfully', {
      deliveryAgent,
      stats: {
        deliveredOrdersCount,
        totalEarnings
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Approve a delivery agent
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const approveDeliveryAgent = async (req, res) => {
  try {
    const deliveryAgentId = req.params.id;
    
    // Find delivery agent
    const deliveryAgent = await User.findOne({
      _id: deliveryAgentId,
      role: USER_ROLES.DELIVERY,
      status: USER_STATUS.PENDING
    });
    
    if (!deliveryAgent) {
      return sendError(res, 404, 'Pending delivery agent not found');
    }
    
    // Update delivery agent status
    deliveryAgent.status = USER_STATUS.ACTIVE;
    await deliveryAgent.save();
    
    // Send notification (placeholder for actual implementation)
    console.log(`Delivery agent ${deliveryAgentId} approved. Send notification to ${deliveryAgent.phone}`);
    
    return sendSuccess(res, 200, 'Delivery agent approved successfully', { deliveryAgent });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Reject a delivery agent
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const rejectDeliveryAgent = async (req, res) => {
  try {
    const deliveryAgentId = req.params.id;
    const { reason } = req.body;
    
    if (!reason) {
      return sendError(res, 400, 'Rejection reason is required');
    }
    
    // Find delivery agent
    const deliveryAgent = await User.findOne({
      _id: deliveryAgentId,
      role: USER_ROLES.DELIVERY,
      status: USER_STATUS.PENDING
    });
    
    if (!deliveryAgent) {
      return sendError(res, 404, 'Pending delivery agent not found');
    }
    
    // Update delivery agent status
    deliveryAgent.status = USER_STATUS.REJECTED;
    deliveryAgent.rejectionReason = reason;
    await deliveryAgent.save();
    
    // Send notification (placeholder for actual implementation)
    console.log(`Delivery agent ${deliveryAgentId} rejected. Send notification to ${deliveryAgent.phone}`);
    
    return sendSuccess(res, 200, 'Delivery agent rejected successfully', { deliveryAgent });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get all customers with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getCustomers = async (req, res) => {
  try {
    const { search, customerId, limit = 10, page = 1 } = req.query;
    
    // Build query
    const query = { role: USER_ROLES.CUSTOMER };
    
    // Search by customerId (exact match)
    if (customerId) {
      query.customerId = customerId;
    } 
    // General search (partial match)
    else if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { customerId: searchRegex }  // Include customerId in general search
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get customers
    const customers = await User.find(query)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalCustomers = await User.countDocuments(query);
    
    return sendSuccess(res, 200, 'Customers retrieved successfully', {
      customers,
      pagination: {
        totalCustomers,
        totalPages: Math.ceil(totalCustomers / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get customer details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getCustomerDetails = async (req, res) => {
  try {
    const customerId = req.params.id;
    
    // Get customer details
    const customer = await User.findOne({
      _id: customerId,
      role: USER_ROLES.CUSTOMER
    }).select('-password -refreshToken');
    
    if (!customer) {
      return sendError(res, 404, 'Customer not found');
    }
    
    // Get customer's orders
    const orders = await Order.find({ customer: customerId })
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Calculate total spent
    const spentData = await Order.aggregate([
      {
        $match: {
          customer: customer._id,
          status: ORDER_STATUS.DELIVERED
        }
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$total' }
        }
      }
    ]);
    
    const totalSpent = spentData.length > 0 ? spentData[0].totalSpent : 0;
    
    return sendSuccess(res, 200, 'Customer details retrieved successfully', {
      customer,
      stats: {
        ordersCount: await Order.countDocuments({ customer: customerId }),
        totalSpent,
        recentOrders: orders
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Find customer by customerId
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const findCustomerById = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return sendError(res, 400, 'Customer ID is required');
    }
    
    // Find the customer by customerId
    const customer = await User.findOne({
      customerId,
      role: USER_ROLES.CUSTOMER
    }).select('-password -refreshToken');
    
    if (!customer) {
      return sendError(res, 404, 'Customer not found with the provided ID');
    }
    
    // Get basic customer statistics
    const ordersCount = await Order.countDocuments({ customer: customer._id });
    
    // Calculate total spent
    const spentData = await Order.aggregate([
      {
        $match: {
          customer: customer._id,
          status: ORDER_STATUS.DELIVERED
        }
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$total' }
        }
      }
    ]);
    
    const totalSpent = spentData.length > 0 ? spentData[0].totalSpent : 0;
    
    return sendSuccess(res, 200, 'Customer found', {
      customer,
      stats: {
        ordersCount,
        totalSpent
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get all orders with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOrders = async (req, res) => {
  try {
    const { status, fromDate, toDate, paymentStatus, limit = 10, page = 1 } = req.query;
    
    // Build query
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }
    
    if (fromDate && toDate) {
      query.createdAt = {
        $gte: new Date(fromDate),
        $lte: new Date(toDate)
      };
    } else if (fromDate) {
      query.createdAt = { $gte: new Date(fromDate) };
    } else if (toDate) {
      query.createdAt = { $lte: new Date(toDate) };
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get orders
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customer', 'firstName lastName phone')
      .populate('vendor', 'firstName lastName')
      .populate('deliveryAgent', 'firstName lastName');
    
    // Get total count for pagination
    const totalOrders = await Order.countDocuments(query);
    
    return sendSuccess(res, 200, 'Orders retrieved successfully', {
      orders,
      pagination: {
        totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get order details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;
    
    // Get order details
    const order = await Order.findById(orderId)
      .populate('customer', 'firstName lastName phone email')
      .populate('vendor', 'firstName lastName phone email')
      .populate('deliveryAgent', 'firstName lastName phone')
      .populate('items.product', 'name images');
    
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    
    return sendSuccess(res, 200, 'Order details retrieved successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Create a new category
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createCategory = async (req, res) => {
  try {
    const { name, description, parent, displayOrder, isActive } = req.body;
    
    // Validate required fields
    if (!name) {
      return sendError(res, 400, 'Category name is required');
    }
    
    // Check if category already exists
    const existingCategory = await Category.findOne({ name });
    
    if (existingCategory) {
      return sendError(res, 409, 'Category with this name already exists');
    }
    
    // If parent category is provided, validate it
    if (parent) {
      const parentCategory = await Category.findById(parent);
      
      if (!parentCategory) {
        return sendError(res, 404, 'Parent category not found');
      }
    }
    
    // Create new category
    const category = new Category({
      name,
      description,
      parent: parent || null,
      displayOrder: displayOrder || 0,
      isActive: isActive !== undefined ? isActive : true
    });
    
    // If image was uploaded in multer middleware, add it to category
    if (req.file) {
      category.image = req.file.path;
    }
    
    await category.save();
    
    return sendSuccess(res, 201, 'Category created successfully', { category });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get all categories
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getCategories = async (req, res) => {
  try {
    const { parent, isActive } = req.query;
    
    // Build query
    const query = {};
    
    if (parent === 'null') {
      query.parent = null;
    } else if (parent) {
      query.parent = parent;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Get categories
    const categories = await Category.find(query)
      .sort({ displayOrder: 1, name: 1 })
      .populate('parent', 'name');
    
    return sendSuccess(res, 200, 'Categories retrieved successfully', { categories });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update a category
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const updateData = req.body;
    
    // Find category
    const category = await Category.findById(categoryId);
    
    if (!category) {
      return sendError(res, 404, 'Category not found');
    }
    
    // If parent category is being updated, validate it
    if (updateData.parent) {
      // Check if trying to set own ID as parent
      if (updateData.parent === categoryId) {
        return sendError(res, 400, 'Category cannot be its own parent');
      }
      
      const parentCategory = await Category.findById(updateData.parent);
      
      if (!parentCategory) {
        return sendError(res, 404, 'Parent category not found');
      }
      
      // Check for circular reference
      let currentParent = parentCategory;
      while (currentParent && currentParent.parent) {
        if (currentParent.parent.toString() === categoryId) {
          return sendError(res, 400, 'Circular reference detected in category hierarchy');
        }
        currentParent = await Category.findById(currentParent.parent);
      }
    }
    
    // If image was uploaded in multer middleware, add it to category
    if (req.file) {
      updateData.image = req.file.path;
    }
    
    // Update category
    const updatedCategory = await Category.findByIdAndUpdate(
      categoryId,
      updateData,
      { new: true, runValidators: true }
    ).populate('parent', 'name');
    
    return sendSuccess(res, 200, 'Category updated successfully', { category: updatedCategory });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Delete a category
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    
    // Check if category has children
    const hasChildren = await Category.exists({ parent: categoryId });
    
    if (hasChildren) {
      return sendError(res, 400, 'Cannot delete category with subcategories');
    }
    
    // Check if category is used in products
    const isUsedInProducts = await Product.exists({ category: categoryId });
    
    if (isUsedInProducts) {
      return sendError(res, 400, 'Cannot delete category that is used in products');
    }
    
    // Delete category
    const category = await Category.findByIdAndDelete(categoryId);
    
    if (!category) {
      return sendError(res, 404, 'Category not found');
    }
    
    return sendSuccess(res, 200, 'Category deleted successfully');
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get dashboard statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDashboardStats = async (req, res) => {
  try {
    // Get counts for different user types
    const activeVendors = await User.countDocuments({
      role: USER_ROLES.VENDOR,
      status: USER_STATUS.ACTIVE
    });
    
    const pendingVendors = await User.countDocuments({
      role: USER_ROLES.VENDOR,
      status: USER_STATUS.PENDING
    });
    
    const activeDeliveryAgents = await User.countDocuments({
      role: USER_ROLES.DELIVERY,
      status: USER_STATUS.ACTIVE
    });
    
    const pendingDeliveryAgents = await User.countDocuments({
      role: USER_ROLES.DELIVERY,
      status: USER_STATUS.PENDING
    });
    
    const totalCustomers = await User.countDocuments({
      role: USER_ROLES.CUSTOMER
    });
    
    // Get counts for different order statuses
    const pendingOrders = await Order.countDocuments({
      status: ORDER_STATUS.PENDING
    });
    
    const inProgressOrders = await Order.countDocuments({
      status: {
        $in: [
          ORDER_STATUS.ACCEPTED,
          ORDER_STATUS.PREPARING,
          ORDER_STATUS.READY_FOR_PICKUP,
          ORDER_STATUS.PICKED_UP,
          ORDER_STATUS.IN_TRANSIT
        ]
      }
    });
    
    const deliveredOrders = await Order.countDocuments({
      status: ORDER_STATUS.DELIVERED
    });
    
    const cancelledOrders = await Order.countDocuments({
      status: ORDER_STATUS.CANCELLED
    });
    
    // Get sales data
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    
    const todaysSales = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfToday },
          status: { $nin: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED] }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      }
    ]);
    
    // Get monthly sales data (for chart)
    const startOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    
    const monthlySales = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfLastMonth },
          status: ORDER_STATUS.DELIVERED
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          revenue: { $sum: '$total' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);
    
    // Format data for chart
    const salesChart = monthlySales.map(item => ({
      date: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}-${item._id.day.toString().padStart(2, '0')}`,
      orders: item.count,
      revenue: item.revenue
    }));
    
    // Build stats object
    const stats = {
      users: {
        vendors: {
          active: activeVendors,
          pending: pendingVendors
        },
        deliveryAgents: {
          active: activeDeliveryAgents,
          pending: pendingDeliveryAgents
        },
        customers: totalCustomers
      },
      orders: {
        pending: pendingOrders,
        inProgress: inProgressOrders,
        delivered: deliveredOrders,
        cancelled: cancelledOrders,
        total: pendingOrders + inProgressOrders + deliveredOrders + cancelledOrders
      },
      sales: {
        today: {
          count: todaysSales.length > 0 ? todaysSales[0].count : 0,
          revenue: todaysSales.length > 0 ? todaysSales[0].revenue : 0
        },
        chart: salesChart
      }
    };
    
    return sendSuccess(res, 200, 'Dashboard stats retrieved successfully', { stats });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get all FAQs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getFaqs = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    
    // Build query
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (category) {
      query.category = category;
    }
    
    // Get FAQs
    const faqs = await FAQ.find(query)
      .sort({ order: 1 });
    
    return sendSuccess(res, 200, 'FAQs retrieved successfully', { faqs });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Create a new FAQ
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createFaq = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { question, answer, category, order } = req.body;
    
    // Validate required fields
    if (!question || !answer) {
      return sendError(res, 400, 'Question and answer are required');
    }
    
    // Create FAQ
    const faq = new FAQ({
      question,
      answer,
      category: category || 'GENERAL',
      order: order || 0,
      isActive: true,
      createdBy: adminId,
      updatedBy: adminId
    });
    
    await faq.save();
    
    return sendSuccess(res, 201, 'FAQ created successfully', { faq });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update an existing FAQ
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateFaq = async (req, res) => {
  try {
    const adminId = req.user._id;
    const faqId = req.params.id;
    const { question, answer, category, order, isActive } = req.body;
    
    // Check if FAQ exists
    const faq = await FAQ.findById(faqId);
    
    if (!faq) {
      return sendError(res, 404, 'FAQ not found');
    }
    
    // Update FAQ
    if (question) faq.question = question;
    if (answer) faq.answer = answer;
    if (category) faq.category = category;
    if (order !== undefined) faq.order = order;
    if (isActive !== undefined) faq.isActive = isActive;
    
    faq.updatedBy = adminId;
    
    await faq.save();
    
    return sendSuccess(res, 200, 'FAQ updated successfully', { faq });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Delete a FAQ
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteFaq = async (req, res) => {
  try {
    const faqId = req.params.id;
    
    // Check if FAQ exists
    const faq = await FAQ.findById(faqId);
    
    if (!faq) {
      return sendError(res, 404, 'FAQ not found');
    }
    
    // Delete FAQ
    await FAQ.findByIdAndDelete(faqId);
    
    return sendSuccess(res, 200, 'FAQ deleted successfully');
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get all banners
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getBanners = async (req, res) => {
  try {
    const { isActive, platform } = req.query;
    
    // Build query
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    // Get banners
    let banners = await Banner.find(query)
      .sort({ order: 1 });
    
    // Filter by platform if specified
    if (platform === 'mobile') {
      banners = banners.filter(banner => banner.showOnMobile);
    } else if (platform === 'web') {
      banners = banners.filter(banner => banner.showOnWeb);
    }
    
    // Filter by active date range
    const now = new Date();
    banners = banners.filter(banner => {
      const startDate = banner.startDate ? new Date(banner.startDate) : null;
      const endDate = banner.endDate ? new Date(banner.endDate) : null;
      
      return (!startDate || startDate <= now) && (!endDate || endDate >= now);
    });
    
    return sendSuccess(res, 200, 'Banners retrieved successfully', { banners });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Create a new banner
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createBanner = async (req, res) => {
  try {
    const adminId = req.user._id;
    const {
      title,
      subtitle,
      targetUrl,
      targetType,
      targetId,
      startDate,
      endDate,
      order,
      showOnMobile,
      showOnWeb
    } = req.body;
    
    // Check if image was uploaded
    if (!req.file) {
      return sendError(res, 400, 'Banner image is required');
    }
    
    // Validate required fields
    if (!title) {
      return sendError(res, 400, 'Title is required');
    }
    
    // Image URL from uploaded file
    const imageUrl = `/uploads/banners/${req.file.filename}`;
    
    // Create banner
    const banner = new Banner({
      title,
      subtitle: subtitle || '',
      imageUrl,
      targetUrl: targetUrl || '',
      targetType: targetType || 'NONE',
      targetId: targetId || '',
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : null,
      order: order || 0,
      showOnMobile: showOnMobile !== false,
      showOnWeb: showOnWeb !== false,
      isActive: true,
      createdBy: adminId,
      updatedBy: adminId
    });
    
    await banner.save();
    
    return sendSuccess(res, 201, 'Banner created successfully', { banner });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update an existing banner
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateBanner = async (req, res) => {
  try {
    const adminId = req.user._id;
    const bannerId = req.params.id;
    const {
      title,
      subtitle,
      targetUrl,
      targetType,
      targetId,
      startDate,
      endDate,
      order,
      showOnMobile,
      showOnWeb,
      isActive
    } = req.body;
    
    // Check if banner exists
    const banner = await Banner.findById(bannerId);
    
    if (!banner) {
      return sendError(res, 404, 'Banner not found');
    }
    
    // Update banner
    if (title) banner.title = title;
    if (subtitle !== undefined) banner.subtitle = subtitle;
    if (req.file) banner.imageUrl = `/uploads/banners/${req.file.filename}`;
    if (targetUrl !== undefined) banner.targetUrl = targetUrl;
    if (targetType) banner.targetType = targetType;
    if (targetId !== undefined) banner.targetId = targetId;
    if (startDate) banner.startDate = new Date(startDate);
    if (endDate) banner.endDate = new Date(endDate);
    if (order !== undefined) banner.order = order;
    if (showOnMobile !== undefined) banner.showOnMobile = showOnMobile;
    if (showOnWeb !== undefined) banner.showOnWeb = showOnWeb;
    if (isActive !== undefined) banner.isActive = isActive;
    
    banner.updatedBy = adminId;
    
    await banner.save();
    
    return sendSuccess(res, 200, 'Banner updated successfully', { banner });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Delete a banner
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteBanner = async (req, res) => {
  try {
    const bannerId = req.params.id;
    
    // Check if banner exists
    const banner = await Banner.findById(bannerId);
    
    if (!banner) {
      return sendError(res, 404, 'Banner not found');
    }
    
    // Delete banner
    await Banner.findByIdAndDelete(bannerId);
    
    // Remove banner image file
    const imagePath = path.join(__dirname, '..', '..', banner.imageUrl);
    try {
      fs.unlinkSync(imagePath);
    } catch (err) {
      console.error('Error deleting banner image:', err);
    }
    
    return sendSuccess(res, 200, 'Banner deleted successfully');
  } catch (error) {
    return handleApiError(res, error);
  }
};

// System Settings Controller
const getSystemSettings = async (req, res) => {
  try {
    let settings = await SystemSetting.findOne();
    
    // Create default settings if none exist
    if (!settings) {
      settings = await SystemSetting.create({});
    }
    
    return res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system settings',
      error: error.message
    });
  }
};

const updateSystemSettings = async (req, res) => {
  try {
    const {
      deliveryFeeBase,
      deliveryFeePerKm,
      serviceFeePercentage,
      taxPercentage,
      vendorCommissionPercentage,
      deliveryAgentCommissionPercentage,
      appVersion,
      maintenance,
      maintenanceMessage
    } = req.body;

    // Validate percentage fields are between 0-100
    const percentageFields = [
      { name: 'serviceFeePercentage', value: serviceFeePercentage },
      { name: 'taxPercentage', value: taxPercentage },
      { name: 'vendorCommissionPercentage', value: vendorCommissionPercentage },
      { name: 'deliveryAgentCommissionPercentage', value: deliveryAgentCommissionPercentage }
    ];

    for (const field of percentageFields) {
      if (field.value !== undefined && (field.value < 0 || field.value > 100)) {
        return res.status(400).json({
          success: false,
          message: `${field.name} must be between 0 and 100`
        });
      }
    }

    let settings = await SystemSetting.findOne();
    
    // Create settings if they don't exist
    if (!settings) {
      settings = await SystemSetting.create(req.body);
      return res.status(201).json({
        success: true,
        message: 'System settings created successfully',
        data: settings
      });
    }
    
    // Update existing settings
    const updatedSettings = await SystemSetting.findOneAndUpdate(
      {},
      { $set: req.body },
      { new: true, runValidators: true }
    );
    
    return res.status(200).json({
      success: true,
      message: 'System settings updated successfully',
      data: updatedSettings
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update system settings',
      error: error.message
    });
  }
};

// Admin Audit Logs Controller
const getAuditLogs = async (req, res) => {
  try {
    const { adminId, action, entity, startDate, endDate, page = 1, limit = 10 } = req.query;
    
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
    
    const options = {
      sort: { timestamp: -1 },
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      populate: {
        path: 'adminId',
        select: 'name email'
      }
    };
    
    const result = await AdminAuditLog.paginate(query, options);
    
    return res.status(200).json({
      success: true,
      data: result.docs,
      pagination: {
        total: result.totalDocs,
        limit: result.limit,
        page: result.page,
        pages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
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

/**
 * Get vendor's documents
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getVendorDocuments = async (req, res) => {
  try {
    const vendorId = req.params.id;
    
    // Find vendor
    const vendor = await User.findOne({
      _id: vendorId,
      role: USER_ROLES.VENDOR
    }).select('legalDocuments registrationDocuments');
    
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }
    
    // Create URLs for all vendor documents
    const baseUrl = `${req.protocol}://${req.get('host')}/`;
    
    const vendorData = vendor.toObject();
    const documents = [];
    
    // Helper function to ensure complete URL
    const ensureCompleteUrl = (url) => {
      if (!url) return null;
      // If it's already a full URL (Cloudinary URLs start with http or https)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      // For local paths, add the base URL
      return baseUrl + url;
    };
    
    // Process legal documents
    if (vendorData.legalDocuments) {
      if (vendorData.legalDocuments.aadhaarPhoto) {
        documents.push({
          type: 'Aadhaar Card',
          number: vendorData.legalDocuments.aadhaarNumber,
          url: ensureCompleteUrl(vendorData.legalDocuments.aadhaarPhoto)
        });
      }
      
      if (vendorData.legalDocuments.panPhoto) {
        documents.push({
          type: 'PAN Card',
          number: vendorData.legalDocuments.panNumber,
          url: ensureCompleteUrl(vendorData.legalDocuments.panPhoto)
        });
      }
      
      if (vendorData.legalDocuments.gstinNumber) {
        documents.push({
          type: 'GSTIN',
          number: vendorData.legalDocuments.gstinNumber,
          url: null // No photo for GSTIN in the schema
        });
      }
      
      if (vendorData.legalDocuments.fssaiNumber) {
        documents.push({
          type: 'FSSAI License',
          number: vendorData.legalDocuments.fssaiNumber,
          url: null // No photo for FSSAI in the schema
        });
      }
    }
    
    // Process registration documents
    if (vendorData.registrationDocuments && vendorData.registrationDocuments.length > 0) {
      vendorData.registrationDocuments.forEach((doc, index) => {
        if (doc.documentUrl) {
          documents.push({
            type: `Registration Document ${index + 1}`,
            number: null,
            url: ensureCompleteUrl(doc.documentUrl),
            uploadedAt: doc.uploadedAt,
            status: doc.status
          });
        }
      });
    }
    
    return sendSuccess(res, 200, 'Vendor documents retrieved successfully', { documents });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get list of vendors with pending registration
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPendingVendorRegistrations = async (req, res) => {
  try {
    const { limit = 20, page = 1, sort = 'createdAt', order = 'desc' } = req.query;
    
    // Build query for pending vendors
    const query = {
      role: USER_ROLES.VENDOR,
      status: USER_STATUS.PENDING
    };
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sortObj = {};
    sortObj[sort] = order === 'desc' ? -1 : 1;
    
    // Get pending vendors
    const pendingVendors = await User.find(query)
      .select('_id fullName email phone username vendorId storeDetails.storeName storeDetails.storeCategory createdAt')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get total count for pagination
    const totalPendingVendors = await User.countDocuments(query);
    
    return sendSuccess(res, 200, 'Pending vendor registrations retrieved successfully', {
      pendingVendors,
      pagination: {
        totalPendingVendors,
        totalPages: Math.ceil(totalPendingVendors / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get vendor registration details
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getVendorRegistrationDetails = async (req, res) => {
  try {
    const vendorId = req.params.id;
    
    // Get vendor registration details
    const vendor = await User.findOne({
      _id: vendorId,
      role: USER_ROLES.VENDOR
    }).select('-password -refreshToken');
    
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }
    
    const vendorData = vendor.toObject();
    
    // Handle Cloudinary URLs
    // Check if the URL is already a full URL (Cloudinary) or needs the base URL added
    const baseUrl = `${req.protocol}://${req.get('host')}/`;
    
    const ensureCompleteUrl = (url) => {
      if (!url) return null;
      // If it's already a full URL (Cloudinary URLs start with http or https)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      // For local paths, add the base URL
      return baseUrl + url;
    };
    
    // Add URLs for profile image
    if (vendorData.profileImage) {
      vendorData.profileImageUrl = ensureCompleteUrl(vendorData.profileImage);
    }
    
    // Add URLs for store photo
    if (vendorData.storeDetails && vendorData.storeDetails.storePhoto) {
      vendorData.storeDetails.storePhotoUrl = ensureCompleteUrl(vendorData.storeDetails.storePhoto);
    }
    
    // Add URLs for legal documents
    if (vendorData.legalDocuments) {
      if (vendorData.legalDocuments.aadhaarPhoto) {
        vendorData.legalDocuments.aadhaarPhotoUrl = ensureCompleteUrl(vendorData.legalDocuments.aadhaarPhoto);
      }
      if (vendorData.legalDocuments.panPhoto) {
        vendorData.legalDocuments.panPhotoUrl = ensureCompleteUrl(vendorData.legalDocuments.panPhoto);
      }
    }
    
    // Add URLs for registration documents
    if (vendorData.registrationDocuments && vendorData.registrationDocuments.length > 0) {
      vendorData.registrationDocuments = vendorData.registrationDocuments.map(doc => {
        if (doc.documentUrl) {
          return {
            ...doc,
            documentFullUrl: ensureCompleteUrl(doc.documentUrl)
          };
        }
        return doc;
      });
    }
    
    return sendSuccess(res, 200, 'Vendor registration details retrieved successfully', {
      vendor: vendorData
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

// System restart controller
const restartSystem = async (req, res) => {
  try {
    // Only allow admins to restart the system
    if (req.user.role !== USER_ROLES.ADMIN) {
      return sendError(res, 403, 'You do not have permission to restart the system');
    }

    console.log('Restarting oliveit-stack service...');
    
    // Use child_process to execute PM2 restart command
    const { exec } = require('child_process');
    
    exec('pm2 restart oliveit-stack', (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing PM2 restart: ${error.message}`);
        return sendError(res, 500, `Failed to restart system: ${error.message}`);
      }
      
      if (stderr) {
        console.error(`PM2 command stderr: ${stderr}`);
      }
      
      console.log(`PM2 command stdout: ${stdout}`);
      
      // Log admin action
      new AdminAuditLog({
        adminId: req.user._id,
        action: 'OTHER',
        entity: 'SETTINGS',
        details: {
          action: 'SYSTEM_RESTART',
          initiatedBy: `${req.user.firstName} ${req.user.lastName}`,
          timestamp: new Date()
        }
      }).save().catch(err => console.error('Error logging restart action:', err));
      
      return sendSuccess(res, 200, 'System restart initiated successfully');
    });
  } catch (error) {
    console.error('Error in system restart:', error);
    return handleApiError(res, error);
  }
};

module.exports = {
  getVendors,
  getVendorDetails,
  getVendorDocuments,
  approveVendor,
  rejectVendor,
  findVendorByFormattedId,
  getDeliveryAgents,
  getDeliveryAgentDetails,
  approveDeliveryAgent,
  rejectDeliveryAgent,
  getCustomers,
  getCustomerDetails,
  findCustomerById,
  getOrders,
  getOrderDetails,
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getDashboardStats,
  getFaqs,
  createFaq,
  updateFaq,
  deleteFaq,
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getSystemSettings,
  updateSystemSettings,
  getAuditLogs,
  getPendingVendorRegistrations,
  getVendorRegistrationDetails,
  deleteVendor,
  restartSystem
}; 