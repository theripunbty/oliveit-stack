const { User } = require('../models/User');
const { Order, ORDER_STATUS } = require('../models/Order');
const { sendSuccess, sendError, handleApiError } = require('../utils/responseUtils');
const { calculateDistance } = require('../utils/locationUtils');
const redisClient = require('../config/redis');
const { Wallet, TRANSACTION_TYPES, TRANSACTION_CATEGORIES } = require('../models/Wallet');
const mongoose = require('mongoose');

/**
 * Get delivery agent profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProfile = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    
    // Get delivery agent data without sensitive information
    const deliveryAgent = await User.findById(deliveryAgentId).select('-password -refreshToken');
    
    if (!deliveryAgent) {
      return sendError(res, 404, 'Delivery agent not found');
    }
    
    return sendSuccess(res, 200, 'Delivery agent profile retrieved successfully', { deliveryAgent });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update delivery agent profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateProfile = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { firstName, lastName, phone } = req.body;
    
    // Create update object with only allowed fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone) updateData.phone = phone;
    
    // Update delivery agent data
    const deliveryAgent = await User.findByIdAndUpdate(
      deliveryAgentId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -refreshToken');
    
    if (!deliveryAgent) {
      return sendError(res, 404, 'Delivery agent not found');
    }
    
    return sendSuccess(res, 200, 'Delivery agent profile updated successfully', { deliveryAgent });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update delivery agent location
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateLocation = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { coordinates, orderId, accuracy, speed, heading } = req.body;
    
    // Validate coordinates
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return sendError(res, 400, 'Valid coordinates are required [longitude, latitude]');
    }
    
    // Validate coordinates range
    const [longitude, latitude] = coordinates;
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return sendError(res, 400, 'Coordinates out of valid range');
    }

    // Update location in database
    const deliveryAgent = await User.findByIdAndUpdate(
      deliveryAgentId,
      {
        location: {
          type: 'Point',
          coordinates
        }
      },
      { new: true }
    ).select('-password -refreshToken');
    
    if (!deliveryAgent) {
      return sendError(res, 404, 'Delivery agent not found');
    }
    
    // Store full location data in Redis for real-time access (with more details)
    const locationData = {
      agentId: deliveryAgentId.toString(),
      coordinates,
      accuracy: accuracy || null,
      speed: speed || null,
      heading: heading || null,
      updatedAt: new Date().toISOString()
    };
    
    await redisClient.set(
      `delivery_location:${deliveryAgentId}`,
      JSON.stringify(locationData),
      'EX',
      300 // Expire in 5 minutes if not updated
    );
    
    // If orderId is provided, update the order-specific location cache
    if (orderId) {
      await redisClient.set(
        `order_delivery_location:${orderId}`,
        JSON.stringify(locationData),
        'EX',
        300 // Expire in 5 minutes
      );
      
      // Emit real-time update through Socket.IO if available
      const io = req.app.get('socketio');
      if (io) {
        io.to(`order-${orderId}`).emit('delivery-location-updated', {
          orderId,
          location: locationData
        });
      }
    }
    
    return sendSuccess(res, 200, 'Location updated successfully');
  } catch (error) {
    console.error('Error updating delivery location:', error);
    return handleApiError(res, error);
  }
};

/**
 * Batch update delivery agent locations (for more efficient location reporting)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const batchUpdateLocation = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { locations } = req.body;
    
    // Validate locations array
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return sendError(res, 400, 'Valid locations array is required');
    }
    
    // Get the latest location from the batch (last one)
    const latestLocation = locations[locations.length - 1];
    const { coordinates, orderId, timestamp } = latestLocation;
    
    // Validate coordinates
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      return sendError(res, 400, 'Valid coordinates are required [longitude, latitude]');
    }
    
    // Update agent's location in database using the latest coordinates
    await User.findByIdAndUpdate(
      deliveryAgentId,
      {
        location: {
          type: 'Point',
          coordinates
        }
      }
    );
    
    // Store all location points in Redis with TTL for location history
    const locationKey = `delivery_location_history:${deliveryAgentId}`;
    const locationData = {
      agentId: deliveryAgentId.toString(),
      locations: locations.map(loc => ({
        coordinates: loc.coordinates,
        timestamp: loc.timestamp || new Date().toISOString(),
        accuracy: loc.accuracy || null,
        speed: loc.speed || null,
        heading: loc.heading || null
      })),
      updatedAt: new Date().toISOString()
    };
    
    await redisClient.set(
      locationKey,
      JSON.stringify(locationData),
      'EX',
      3600 // Keep location history for 1 hour
    );
    
    // Also update the current location in Redis
    await redisClient.set(
      `delivery_location:${deliveryAgentId}`,
      JSON.stringify({
        agentId: deliveryAgentId.toString(),
        coordinates,
        accuracy: latestLocation.accuracy || null,
        speed: latestLocation.speed || null,
        heading: latestLocation.heading || null,
        updatedAt: new Date().toISOString()
      }),
      'EX',
      300 // Expire in 5 minutes if not updated
    );
    
    // If orderId is provided, update the order-specific location cache and emit Socket.IO event
    if (orderId) {
      const orderLocationData = {
        agentId: deliveryAgentId.toString(),
        coordinates,
        accuracy: latestLocation.accuracy || null,
        speed: latestLocation.speed || null,
        heading: latestLocation.heading || null,
        timestamp: timestamp || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await redisClient.set(
        `order_delivery_location:${orderId}`,
        JSON.stringify(orderLocationData),
        'EX',
        300 // Expire in 5 minutes
      );
      
      // Emit real-time update through Socket.IO if available
      const io = req.app.get('socketio');
      if (io) {
        io.to(`order-${orderId}`).emit('delivery-location-updated', {
          orderId,
          location: orderLocationData
        });
      }
    }
    
    return sendSuccess(res, 200, 'Location batch updated successfully');
  } catch (error) {
    console.error('Error updating delivery locations in batch:', error);
    return handleApiError(res, error);
  }
};

/**
 * Get nearby available orders
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getNearbyOrders = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { maxDistance = 5 } = req.query; // Default 5km radius
    
    // Get agent location from database
    const agent = await User.findById(deliveryAgentId);
    
    if (!agent || !agent.location || !agent.location.coordinates) {
      return sendError(res, 400, 'Agent location not available');
    }
    
    // Find orders ready for pickup without assigned delivery agent
    const orders = await Order.find({
      status: ORDER_STATUS.READY_FOR_PICKUP,
      deliveryAgent: null
    }).populate('vendor', 'firstName lastName location');
    
    // Filter orders based on distance from agent
    const nearbyOrders = orders.filter(order => {
      // Only process orders with valid vendor location
      if (order.vendor && order.vendor.location && order.vendor.location.coordinates) {
        const agentCoords = agent.location.coordinates;
        const vendorCoords = order.vendor.location.coordinates;
        
        // Calculate distance
        const distance = calculateDistance(
          agentCoords[1], // latitude
          agentCoords[0], // longitude
          vendorCoords[1], // latitude
          vendorCoords[0]  // longitude
        );
        
        // Add distance to order object for frontend
        order._doc.distance = distance.toFixed(2);
        
        // Return true if within maxDistance
        return distance <= maxDistance;
      }
      
      return false;
    });
    
    // Sort by distance
    nearbyOrders.sort((a, b) => parseFloat(a._doc.distance) - parseFloat(b._doc.distance));
    
    return sendSuccess(res, 200, 'Nearby orders retrieved successfully', { orders: nearbyOrders });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get assigned orders
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAssignedOrders = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { status } = req.query;
    
    // Build query
    const query = { deliveryAgent: deliveryAgentId };
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    } else {
      // By default, show only active orders
      query.status = {
        $in: [
          ORDER_STATUS.READY_FOR_PICKUP,
          ORDER_STATUS.PICKED_UP,
          ORDER_STATUS.IN_TRANSIT
        ]
      };
    }
    
    // Get orders
    const orders = await Order.find(query)
      .sort({ updatedAt: -1 })
      .populate('customer', 'firstName lastName phone')
      .populate('vendor', 'firstName lastName phone location');
    
    return sendSuccess(res, 200, 'Assigned orders retrieved successfully', { orders });
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
    const deliveryAgentId = req.user._id;
    const orderId = req.params.id;
    
    // Get order
    const order = await Order.findOne({
      _id: orderId,
      $or: [
        { deliveryAgent: deliveryAgentId },
        { status: ORDER_STATUS.READY_FOR_PICKUP, deliveryAgent: null }
      ]
    })
      .populate('customer', 'firstName lastName phone')
      .populate('vendor', 'firstName lastName phone location')
      .populate('items.product', 'name images');
    
    if (!order) {
      return sendError(res, 404, 'Order not found or not accessible');
    }
    
    return sendSuccess(res, 200, 'Order details retrieved successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Accept an order for delivery
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const acceptOrder = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const orderId = req.params.id;
    
    // Get order
    const order = await Order.findOne({
      _id: orderId,
      status: ORDER_STATUS.READY_FOR_PICKUP,
      deliveryAgent: null
    });
    
    if (!order) {
      return sendError(res, 404, 'Order not found or already assigned');
    }
    
    // Assign delivery agent to order
    order.deliveryAgent = deliveryAgentId;
    
    // Add status history entry
    order.statusHistory.push({
      status: order.status,
      timestamp: new Date(),
      updatedBy: deliveryAgentId,
      notes: 'Delivery agent assigned'
    });
    
    await order.save();
    
    return sendSuccess(res, 200, 'Order accepted for delivery', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Mark order as picked up
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const pickupOrder = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const orderId = req.params.id;
    
    // Get order
    const order = await Order.findOne({
      _id: orderId,
      deliveryAgent: deliveryAgentId,
      status: ORDER_STATUS.READY_FOR_PICKUP
    });
    
    if (!order) {
      return sendError(res, 404, 'Order not found or not in ready for pickup status');
    }
    
    // Update order status
    order.status = ORDER_STATUS.PICKED_UP;
    
    // Add status history entry
    order.statusHistory.push({
      status: ORDER_STATUS.PICKED_UP,
      timestamp: new Date(),
      updatedBy: deliveryAgentId,
      notes: 'Order picked up by delivery agent'
    });
    
    await order.save();
    
    return sendSuccess(res, 200, 'Order marked as picked up', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Mark order as in transit
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const startDelivery = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const orderId = req.params.id;
    
    // Get order
    const order = await Order.findOne({
      _id: orderId,
      deliveryAgent: deliveryAgentId,
      status: ORDER_STATUS.PICKED_UP
    });
    
    if (!order) {
      return sendError(res, 404, 'Order not found or not in picked up status');
    }
    
    // Update order status
    order.status = ORDER_STATUS.IN_TRANSIT;
    
    // Add status history entry
    order.statusHistory.push({
      status: ORDER_STATUS.IN_TRANSIT,
      timestamp: new Date(),
      updatedBy: deliveryAgentId,
      notes: 'Delivery started'
    });
    
    await order.save();
    
    return sendSuccess(res, 200, 'Delivery started', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Mark order as delivered
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const completeDelivery = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const orderId = req.params.id;
    
    // Get order
    const order = await Order.findOne({
      _id: orderId,
      deliveryAgent: deliveryAgentId,
      $or: [
        { status: ORDER_STATUS.PICKED_UP },
        { status: ORDER_STATUS.IN_TRANSIT }
      ]
    });
    
    if (!order) {
      return sendError(res, 404, 'Order not found or not in valid status for delivery');
    }
    
    // Update order status
    order.status = ORDER_STATUS.DELIVERED;
    order.actualDeliveryTime = new Date();
    
    // Add status history entry
    order.statusHistory.push({
      status: ORDER_STATUS.DELIVERED,
      timestamp: new Date(),
      updatedBy: deliveryAgentId,
      notes: 'Order delivered successfully'
    });
    
    await order.save();
    
    return sendSuccess(res, 200, 'Order delivered successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get delivery agent earnings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getEarnings = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { period = 'today' } = req.query;
    
    // Get start date based on period
    let startDate = new Date();
    const endDate = new Date();
    
    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'yesterday') {
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(endDate.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    }
    
    // Get completed orders
    const query = {
      deliveryAgent: deliveryAgentId,
      status: ORDER_STATUS.DELIVERED
    };
    
    if (period !== 'all') {
      query.updatedAt = { $gte: startDate };
      
      if (period === 'yesterday') {
        query.updatedAt.$lte = endDate;
      }
    }
    
    // Calculate earnings (assuming deliveryFee goes to the delivery agent)
    const orders = await Order.find(query);
    
    let totalEarnings = 0;
    let deliveryCount = orders.length;
    let averageEarningsPerDelivery = 0;
    
    // Simple calculation: delivery agent gets the delivery fee
    orders.forEach(order => {
      totalEarnings += order.deliveryFee || 0;
    });
    
    if (deliveryCount > 0) {
      averageEarningsPerDelivery = totalEarnings / deliveryCount;
    }
    
    // Get earnings breakdown by day (for charts)
    const earningsByDay = {};
    
    orders.forEach(order => {
      const date = order.updatedAt.toISOString().split('T')[0];
      
      if (!earningsByDay[date]) {
        earningsByDay[date] = {
          earnings: 0,
          deliveries: 0
        };
      }
      
      earningsByDay[date].earnings += order.deliveryFee || 0;
      earningsByDay[date].deliveries += 1;
    });
    
    // Convert to array for frontend charts
    const earningsChart = Object.keys(earningsByDay).map(date => ({
      date,
      earnings: earningsByDay[date].earnings,
      deliveries: earningsByDay[date].deliveries
    }));
    
    // Sort by date
    earningsChart.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return sendSuccess(res, 200, 'Earnings retrieved successfully', {
      period,
      deliveryCount,
      totalEarnings,
      averageEarningsPerDelivery,
      earningsChart
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get delivery agent delivery history
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDeliveryHistory = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { limit = 20, page = 1 } = req.query;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get completed orders
    const orders = await Order.find({
      deliveryAgent: deliveryAgentId,
      status: ORDER_STATUS.DELIVERED
    })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('customer', 'firstName lastName')
      .populate('vendor', 'firstName lastName');
    
    // Get total count for pagination
    const totalOrders = await Order.countDocuments({
      deliveryAgent: deliveryAgentId,
      status: ORDER_STATUS.DELIVERED
    });
    
    return sendSuccess(res, 200, 'Delivery history retrieved successfully', {
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
 * Reject an order for delivery
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const rejectDeliveryJob = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const orderId = req.params.id;
    const { reason } = req.body;
    
    if (!reason) {
      return sendError(res, 400, 'Rejection reason is required');
    }
    
    // Get order
    const order = await Order.findOne({
      _id: orderId,
      status: ORDER_STATUS.READY_FOR_PICKUP,
      deliveryAgent: null // Ensure not already assigned
    });
    
    if (!order) {
      return sendError(res, 404, 'Order not found or already assigned');
    }
    
    // Add rejection to a separate collection to track it for future assignment decisions
    await DeliveryJobRejection.create({
      order: orderId,
      deliveryAgent: deliveryAgentId,
      reason,
      timestamp: new Date()
    });
    
    return sendSuccess(res, 200, 'Delivery job rejected successfully');
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get delivery agent wallet
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getWallet = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    
    // Get or create wallet
    let wallet = await Wallet.findOne({ user: deliveryAgentId });
    
    if (!wallet) {
      wallet = await Wallet.create({
        user: deliveryAgentId,
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
    
    const todayEarnings = wallet.transactions
      .filter(t => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return t.createdAt >= today && 
               t.status === 'completed' && 
               t.type === TRANSACTION_TYPES.CREDIT &&
               t.category === TRANSACTION_CATEGORIES.DELIVERY_EARNINGS;
      })
      .reduce((sum, t) => sum + t.amount, 0);
    
    return sendSuccess(res, 200, 'Wallet retrieved successfully', {
      wallet: {
        balance: wallet.balance,
        pendingAmount,
        todayEarnings,
        recentTransactions
      }
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Report an issue with delivery
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const reportDeliveryIssue = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const orderId = req.params.id;
    const { issueType, description, images } = req.body;
    
    // Validate required fields
    if (!issueType || !description) {
      return sendError(res, 400, 'Issue type and description are required');
    }
    
    // Get order
    const order = await Order.findOne({
      _id: orderId,
      deliveryAgent: deliveryAgentId
    });
    
    if (!order) {
      return sendError(res, 404, 'Order not found or not assigned to this delivery agent');
    }
    
    // Add issue to order
    order.deliveryIssues = order.deliveryIssues || [];
    order.deliveryIssues.push({
      issueType,
      description,
      images: images || [],
      reportedBy: deliveryAgentId,
      reportedAt: new Date()
    });
    
    // Add status history entry
    order.statusHistory.push({
      status: order.status,
      timestamp: new Date(),
      updatedBy: deliveryAgentId,
      notes: `Delivery issue reported: ${issueType} - ${description}`
    });
    
    await order.save();
    
    // Notify admin and customer about the issue via Socket.IO
    const io = req.app.get('socketio');
    if (io) {
      const issueData = {
        orderId,
        issueType,
        description,
        reportedAt: new Date().toISOString()
      };
      
      // Notify customer
      io.to(`customer-${order.customer}`).emit('delivery-issue-reported', issueData);
      
      // Notify admins
      io.to('admin-channel').emit('delivery-issue-reported', {
        ...issueData,
        deliveryAgentId: deliveryAgentId.toString()
      });
    }
    
    return sendSuccess(res, 200, 'Delivery issue reported successfully', { order });
  } catch (error) {
    console.error('Error reporting delivery issue:', error);
    return handleApiError(res, error);
  }
};

/**
 * Update estimated time of arrival for an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateETA = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const orderId = req.params.id;
    const { estimatedMinutes, reason } = req.body;
    
    // Validate required fields
    if (!estimatedMinutes || isNaN(parseInt(estimatedMinutes))) {
      return sendError(res, 400, 'Valid estimated minutes are required');
    }
    
    // Get order
    const order = await Order.findOne({
      _id: orderId,
      deliveryAgent: deliveryAgentId,
      status: { $in: [ORDER_STATUS.PICKED_UP, ORDER_STATUS.IN_TRANSIT] }
    });
    
    if (!order) {
      return sendError(res, 404, 'Order not found or not in active delivery status');
    }
    
    // Calculate new ETA
    const eta = new Date();
    eta.setMinutes(eta.getMinutes() + parseInt(estimatedMinutes));
    
    // Update order
    order.estimatedDeliveryTime = eta;
    
    // Add status history entry
    order.statusHistory.push({
      status: order.status,
      timestamp: new Date(),
      updatedBy: deliveryAgentId,
      notes: `Updated ETA: ${estimatedMinutes} minutes ${reason ? `(${reason})` : ''}`
    });
    
    await order.save();
    
    // Notify customer about updated ETA via Socket.IO
    const io = req.app.get('socketio');
    if (io) {
      io.to(`order-${orderId}`).emit('delivery-eta-updated', {
        orderId,
        estimatedMinutes: parseInt(estimatedMinutes),
        estimatedDeliveryTime: eta.toISOString(),
        reason: reason || 'Route updated'
      });
    }
    
    return sendSuccess(res, 200, 'Estimated delivery time updated successfully', { 
      order,
      estimatedDeliveryTime: eta
    });
  } catch (error) {
    console.error('Error updating ETA:', error);
    return handleApiError(res, error);
  }
};

/**
 * Get delivery agent online status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOnlineStatus = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    
    // Get agent
    const agent = await User.findById(deliveryAgentId).select('isOnline lastOnlineAt');
    
    if (!agent) {
      return sendError(res, 404, 'Delivery agent not found');
    }
    
    // Return status
    return sendSuccess(res, 200, 'Online status retrieved successfully', {
      isOnline: agent.isOnline || false,
      lastOnlineAt: agent.lastOnlineAt
    });
  } catch (error) {
    console.error('Error getting online status:', error);
    return handleApiError(res, error);
  }
};

/**
 * Update delivery agent online status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateOnlineStatus = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { isOnline } = req.body;
    
    // Validate input
    if (typeof isOnline !== 'boolean') {
      return sendError(res, 400, 'Valid isOnline boolean is required');
    }
    
    // Update status
    const agent = await User.findByIdAndUpdate(
      deliveryAgentId,
      {
        isOnline,
        lastOnlineAt: isOnline ? new Date() : undefined
      },
      { new: true }
    ).select('-password -refreshToken');
    
    if (!agent) {
      return sendError(res, 404, 'Delivery agent not found');
    }
    
    // Also update in Redis for real-time availability checks
    await redisClient.set(
      `delivery_online:${deliveryAgentId}`,
      JSON.stringify({
        agentId: deliveryAgentId.toString(),
        isOnline,
        updatedAt: new Date().toISOString()
      }),
      'EX',
      3600 // Expire in 1 hour
    );
    
    return sendSuccess(res, 200, `Delivery agent is now ${isOnline ? 'online' : 'offline'}`);
  } catch (error) {
    console.error('Error updating online status:', error);
    return handleApiError(res, error);
  }
};

/**
 * Request cashout for delivery agent earnings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const requestCashout = async (req, res) => {
  try {
    const deliveryAgentId = req.user._id;
    const { amount } = req.body;
    
    // Validate amount
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return sendError(res, 400, 'Valid amount is required');
    }
    
    const cashoutAmount = parseFloat(amount);
    
    // Start a session for transaction
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Get wallet balance
      const wallet = await Wallet.findOne({ user: deliveryAgentId }).session(session);
      
      if (!wallet) {
        await session.abortTransaction();
        session.endSession();
        return sendError(res, 404, 'Wallet not found');
      }
      
      // Check if enough balance
      if (wallet.balance < cashoutAmount) {
        await session.abortTransaction();
        session.endSession();
        return sendError(res, 400, 'Insufficient wallet balance');
      }
      
      // Create cashout transaction
      const transaction = {
        type: TRANSACTION_TYPES.DEBIT,
        amount: cashoutAmount,
        description: 'Cashout request',
        category: TRANSACTION_CATEGORIES.CASHOUT,
        status: 'pending',
        reference: `CASHOUT-${Date.now()}`
      };
      
      wallet.transactions.push(transaction);
      
      // Deduct from wallet balance
      wallet.balance -= cashoutAmount;
      
      await wallet.save({ session });
      
      // Commit transaction
      await session.commitTransaction();
      session.endSession();
      
      return sendSuccess(res, 200, 'Cashout request submitted successfully', { 
        transactionId: transaction._id,
        amount: cashoutAmount,
        newBalance: wallet.balance,
        status: 'pending'
      });
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error('Error requesting cashout:', error);
    return handleApiError(res, error);
  }
};

// Create a DeliveryJobRejection model (simplified inline for this example)
const DeliveryJobRejection = mongoose.model('DeliveryJobRejection', new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  deliveryAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}));

// Export all controller functions
module.exports = {
  getProfile,
  updateProfile,
  updateLocation,
  batchUpdateLocation,
  getNearbyOrders,
  getAssignedOrders,
  getOrderDetails,
  acceptOrder,
  pickupOrder,
  startDelivery,
  completeDelivery,
  getEarnings,
  getDeliveryHistory,
  rejectDeliveryJob,
  getWallet,
  reportDeliveryIssue,
  updateETA,
  getOnlineStatus,
  updateOnlineStatus,
  requestCashout
}; 