const { User, USER_STATUS } = require('../models/User');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { Order, ORDER_STATUS } = require('../models/Order');
const { sendSuccess, sendError, handleApiError } = require('../utils/responseUtils');
const Promotion = require('../models/Promotion');
const { Wallet, TRANSACTION_TYPES, TRANSACTION_CATEGORIES } = require('../models/Wallet');

/**
 * Get vendor profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProfile = async (req, res) => {
  try {
    const vendorId = req.user._id;
    
    // Get vendor data without sensitive information
    const vendor = await User.findById(vendorId).select('-password -refreshToken');
    
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }
    
    return sendSuccess(res, 200, 'Vendor profile retrieved successfully', { vendor });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update vendor profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateProfile = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const { firstName, lastName, phone, location } = req.body;
    
    // Create update object with only allowed fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone) updateData.phone = phone;
    if (location) updateData.location = location;
    
    // Update vendor data
    const vendor = await User.findByIdAndUpdate(
      vendorId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -refreshToken');
    
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }
    
    return sendSuccess(res, 200, 'Vendor profile updated successfully', { vendor });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Create a new product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createProduct = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const {
      name,
      description,
      category,
      price,
      discountPrice,
      unit,
      quantity,
      inStock,
      attributes,
      tags
    } = req.body;
    
    // Validate required fields
    if (!name || !category || !price || !unit) {
      return sendError(res, 400, 'Required product fields are missing');
    }
    
    // Validate category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return sendError(res, 404, 'Category not found');
    }
    
    // Create new product
    const product = new Product({
      name,
      description,
      category,
      vendor: vendorId,
      price,
      discountPrice: discountPrice || 0,
      unit,
      quantity: quantity || 1,
      inStock: inStock !== undefined ? inStock : true,
      attributes: attributes || {},
      tags: tags || []
    });
    
    // If images were uploaded in multer middleware, add them to product
    if (req.files && req.files.length > 0) {
      product.images = req.files.map(file => file.path);
    }
    
    await product.save();
    
    return sendSuccess(res, 201, 'Product created successfully', { product });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get all products for a vendor
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProducts = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const { category, inStock, limit = 20, page = 1, sort = 'createdAt', order = 'desc' } = req.query;
    
    // Build query
    const query = { vendor: vendorId };
    if (category) query.category = category;
    if (inStock !== undefined) query.inStock = inStock === 'true';
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sortObj = {};
    sortObj[sort] = order === 'desc' ? -1 : 1;
    
    // Get products
    const products = await Product.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('category', 'name');
    
    // Get total count for pagination
    const totalProducts = await Product.countDocuments(query);
    
    return sendSuccess(res, 200, 'Products retrieved successfully', {
      products,
      pagination: {
        totalProducts,
        totalPages: Math.ceil(totalProducts / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get a specific product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProduct = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const productId = req.params.id;
    
    // Get product
    const product = await Product.findOne({ _id: productId, vendor: vendorId })
      .populate('category', 'name');
    
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    
    return sendSuccess(res, 200, 'Product retrieved successfully', { product });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update a product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateProduct = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const productId = req.params.id;
    const updateData = req.body;
    
    // Find product
    const product = await Product.findOne({ _id: productId, vendor: vendorId });
    
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    
    // If category is being updated, validate it exists
    if (updateData.category) {
      const categoryExists = await Category.findById(updateData.category);
      if (!categoryExists) {
        return sendError(res, 404, 'Category not found');
      }
    }
    
    // If images were uploaded in multer middleware, add them to product
    if (req.files && req.files.length > 0) {
      updateData.images = req.files.map(file => file.path);
    }
    
    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updateData,
      { new: true, runValidators: true }
    ).populate('category', 'name');
    
    return sendSuccess(res, 200, 'Product updated successfully', { product: updatedProduct });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Delete a product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteProduct = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const productId = req.params.id;
    
    // Find and delete product
    const product = await Product.findOneAndDelete({ _id: productId, vendor: vendorId });
    
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    
    return sendSuccess(res, 200, 'Product deleted successfully');
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update product stock status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateProductStock = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const productId = req.params.id;
    const { inStock } = req.body;
    
    if (inStock === undefined) {
      return sendError(res, 400, 'Stock status (inStock) is required');
    }
    
    // Find product
    const product = await Product.findOne({ _id: productId, vendor: vendorId });
    
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    
    // Update stock status
    product.inStock = inStock;
    await product.save();
    
    return sendSuccess(res, 200, 'Product stock updated successfully', { product });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get all orders for a vendor
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOrders = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const { status, limit = 10, page = 1 } = req.query;
    
    // Build query
    const query = { vendor: vendorId };
    if (status) {
      query.status = status;
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get orders
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customer', 'firstName lastName phone')
      .populate('deliveryAgent', 'firstName lastName phone')
      .populate('items.product', 'name images');
    
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
    const vendorId = req.user._id;
    const orderId = req.params.id;
    
    // Get order details
    const order = await Order.findOne({ _id: orderId, vendor: vendorId })
      .populate('customer', 'firstName lastName phone')
      .populate('items.product', 'name images unit')
      .populate('deliveryAgent', 'firstName lastName phone');
    
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    
    return sendSuccess(res, 200, 'Order details retrieved successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Accept an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const acceptOrder = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const orderId = req.params.id;
    const { preparationTime } = req.body;
    
    // Get order
    const order = await Order.findOne({ _id: orderId, vendor: vendorId });
    
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    
    // Check if order can be accepted
    if (order.status !== ORDER_STATUS.PENDING) {
      return sendError(res, 400, `Cannot accept order in ${order.status} status`);
    }
    
    // Calculate estimated delivery time
    const prepTime = preparationTime || 30; // Default to 30 minutes
    const estimatedDeliveryTime = new Date();
    estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + prepTime + 30); // Add preparation time + delivery time
    
    // Update order status
    order.status = ORDER_STATUS.ACCEPTED;
    order.estimatedDeliveryTime = estimatedDeliveryTime;
    
    // Add status history entry
    order.statusHistory.push({
      status: ORDER_STATUS.ACCEPTED,
      timestamp: new Date(),
      updatedBy: vendorId,
      notes: `Accepted by vendor. Estimated preparation time: ${prepTime} minutes.`
    });
    
    await order.save();
    
    return sendSuccess(res, 200, 'Order accepted successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Reject an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const rejectOrder = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const orderId = req.params.id;
    const { reason } = req.body;
    
    if (!reason) {
      return sendError(res, 400, 'Rejection reason is required');
    }
    
    // Get order
    const order = await Order.findOne({ _id: orderId, vendor: vendorId });
    
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    
    // Check if order can be rejected
    if (order.status !== ORDER_STATUS.PENDING) {
      return sendError(res, 400, `Cannot reject order in ${order.status} status`);
    }
    
    // Update order status
    order.status = ORDER_STATUS.REJECTED;
    order.rejectionReason = reason;
    
    // Add status history entry
    order.statusHistory.push({
      status: ORDER_STATUS.REJECTED,
      timestamp: new Date(),
      updatedBy: vendorId,
      notes: `Rejected by vendor. Reason: ${reason}`
    });
    
    await order.save();
    
    return sendSuccess(res, 200, 'Order rejected successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update order status to ready for pickup
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const orderReadyForPickup = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const orderId = req.params.id;
    
    // Get order
    const order = await Order.findOne({ _id: orderId, vendor: vendorId });
    
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    
    // Check if order can be marked as ready
    if (order.status !== ORDER_STATUS.ACCEPTED && order.status !== ORDER_STATUS.PREPARING) {
      return sendError(res, 400, `Cannot mark order as ready in ${order.status} status`);
    }
    
    // Update order status
    order.status = ORDER_STATUS.READY_FOR_PICKUP;
    
    // Add status history entry
    order.statusHistory.push({
      status: ORDER_STATUS.READY_FOR_PICKUP,
      timestamp: new Date(),
      updatedBy: vendorId,
      notes: 'Order is ready for pickup'
    });
    
    await order.save();
    
    return sendSuccess(res, 200, 'Order marked as ready for pickup', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get vendor dashboard stats
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDashboardStats = async (req, res) => {
  try {
    const vendorId = req.user._id;
    
    // Get today's date and start of day
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    
    // Get start of month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Count total products
    const totalProducts = await Product.countDocuments({ vendor: vendorId });
    
    // Count products out of stock
    const outOfStock = await Product.countDocuments({ vendor: vendorId, inStock: false });
    
    // Get today's orders
    const todayOrders = await Order.countDocuments({
      vendor: vendorId,
      createdAt: { $gte: startOfToday }
    });
    
    // Get today's revenue
    const todayRevenue = await Order.aggregate([
      {
        $match: {
          vendor: vendorId,
          status: { $nin: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED] },
          createdAt: { $gte: startOfToday }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$subtotal' }
        }
      }
    ]);
    
    // Get monthly revenue
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          vendor: vendorId,
          status: { $nin: [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED] },
          createdAt: { $gte: startOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$subtotal' }
        }
      }
    ]);
    
    // Count orders by status
    const pendingOrders = await Order.countDocuments({
      vendor: vendorId,
      status: ORDER_STATUS.PENDING
    });
    
    const acceptedOrders = await Order.countDocuments({
      vendor: vendorId,
      status: ORDER_STATUS.ACCEPTED
    });
    
    const readyForPickupOrders = await Order.countDocuments({
      vendor: vendorId,
      status: ORDER_STATUS.READY_FOR_PICKUP
    });
    
    const deliveredOrders = await Order.countDocuments({
      vendor: vendorId,
      status: ORDER_STATUS.DELIVERED
    });
    
    // Build stats object
    const stats = {
      products: {
        total: totalProducts,
        outOfStock
      },
      orders: {
        today: todayOrders,
        pending: pendingOrders,
        accepted: acceptedOrders,
        readyForPickup: readyForPickupOrders,
        delivered: deliveredOrders
      },
      revenue: {
        today: todayRevenue.length > 0 ? todayRevenue[0].total : 0,
        month: monthlyRevenue.length > 0 ? monthlyRevenue[0].total : 0
      }
    };
    
    return sendSuccess(res, 200, 'Dashboard stats retrieved successfully', { stats });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get vendor analytics and sales data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getSalesAnalytics = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const { period = 'week' } = req.query;
    
    // Determine date range based on period
    const endDate = new Date();
    let startDate = new Date();
    
    if (period === 'day') {
      startDate.setDate(startDate.getDate() - 1);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'year') {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }
    
    // Get completed orders in date range
    const completedOrders = await Order.find({
      vendor: vendorId,
      status: ORDER_STATUS.DELIVERED,
      createdAt: { $gte: startDate, $lte: endDate }
    }).sort({ createdAt: 1 });
    
    // Get total sales, order count, and average order value
    let totalSales = 0;
    let orderCount = completedOrders.length;
    
    completedOrders.forEach(order => {
      totalSales += order.total;
    });
    
    const averageOrderValue = orderCount > 0 ? totalSales / orderCount : 0;
    
    // Group sales by day for chart data
    const salesByDay = {};
    
    completedOrders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0];
      
      if (!salesByDay[date]) {
        salesByDay[date] = {
          sales: 0,
          orders: 0
        };
      }
      
      salesByDay[date].sales += order.total;
      salesByDay[date].orders += 1;
    });
    
    // Convert to array for frontend charts
    const salesChart = Object.keys(salesByDay).map(date => ({
      date,
      sales: salesByDay[date].sales,
      orders: salesByDay[date].orders
    }));
    
    // Get top products by sales
    const topProducts = await Order.aggregate([
      { $match: { vendor: mongoose.Types.ObjectId(vendorId), status: ORDER_STATUS.DELIVERED } },
      { $unwind: '$items' },
      { $group: {
          _id: '$items.product',
          totalSales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          totalQuantity: { $sum: '$items.quantity' }
        }
      },
      { $sort: { totalSales: -1 } },
      { $limit: 5 },
      { $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      { $project: {
          product: { _id: '$product._id', name: '$product.name' },
          totalSales: 1,
          totalQuantity: 1
        }
      }
    ]);
    
    return sendSuccess(res, 200, 'Sales analytics retrieved successfully', {
      period,
      totalSales,
      orderCount,
      averageOrderValue,
      salesChart,
      topProducts
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Create a new promotion
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createPromotion = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const {
      title,
      description,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscount,
      applicableProducts,
      applicableCategories,
      startDate,
      endDate,
      code,
      usageLimit
    } = req.body;
    
    // Validate discount value based on type
    if (discountType === 'PERCENTAGE' && (discountValue <= 0 || discountValue > 100)) {
      return sendError(res, 400, 'Percentage discount must be between 1 and 100');
    }
    
    if ((discountType === 'FIXED' || discountType === 'BUY_GET') && discountValue <= 0) {
      return sendError(res, 400, 'Discount value must be greater than 0');
    }
    
    // Check for duplicate promotion code if provided
    if (code) {
      const existingPromotion = await Promotion.findOne({
        vendor: vendorId,
        code: code.toUpperCase(),
        isActive: true
      });
      
      if (existingPromotion) {
        return sendError(res, 409, 'Promotion code already exists');
      }
    }
    
    // Create promotion
    const promotion = new Promotion({
      vendor: vendorId,
      title,
      description,
      discountType,
      discountValue,
      minOrderValue: minOrderValue || 0,
      maxDiscount: maxDiscount || null,
      applicableProducts: applicableProducts || [],
      applicableCategories: applicableCategories || [],
      startDate: startDate || new Date(),
      endDate,
      code: code ? code.toUpperCase() : null,
      usageLimit: usageLimit || null,
      isActive: true
    });
    
    await promotion.save();
    
    return sendSuccess(res, 201, 'Promotion created successfully', { promotion });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get vendor promotions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPromotions = async (req, res) => {
  try {
    const vendorId = req.user._id;
    const { status } = req.query;
    
    // Build query based on status
    const query = { vendor: vendorId };
    
    if (status === 'active') {
      query.isActive = true;
      query.endDate = { $gte: new Date() };
    } else if (status === 'expired') {
      query.endDate = { $lt: new Date() };
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    
    // Get promotions
    const promotions = await Promotion.find(query).sort({ createdAt: -1 });
    
    return sendSuccess(res, 200, 'Promotions retrieved successfully', { promotions });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get vendor wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWallet = async (req, res) => {
  try {
    const vendorId = req.user._id;
    
    // Get or create vendor wallet
    let wallet = await Wallet.findOne({ user: vendorId });
    
    if (!wallet) {
      wallet = await Wallet.create({
        user: vendorId,
        balance: 0,
        transactions: []
      });
    }
    
    // Get recent transactions
    const recentTransactions = wallet.transactions
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
    
    // Calculate summary statistics
    const pendingAmount = wallet.transactions
      .filter(t => t.status === 'pending' && t.type === TRANSACTION_TYPES.CREDIT)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const lastMonthEarnings = wallet.transactions
      .filter(t => {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return t.createdAt >= oneMonthAgo && 
               t.status === 'completed' && 
               t.type === TRANSACTION_TYPES.CREDIT &&
               t.category === TRANSACTION_CATEGORIES.VENDOR_SETTLEMENT;
      })
      .reduce((sum, t) => sum + t.amount, 0);
    
    return sendSuccess(res, 200, 'Wallet retrieved successfully', {
      wallet: {
        balance: wallet.balance,
        pendingAmount,
        lastMonthEarnings,
        recentTransactions
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  updateProductStock,
  getOrders,
  getOrderDetails,
  acceptOrder,
  rejectOrder,
  orderReadyForPickup,
  getDashboardStats,
  getSalesAnalytics,
  createPromotion,
  getPromotions,
  getWallet
}; 