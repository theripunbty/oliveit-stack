const { User, USER_ROLES, USER_STATUS } = require('../models/User');
const Address = require('../models/Address');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { Order, ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHOD } = require('../models/Order');
const { sendSuccess, sendError, handleApiError } = require('../utils/responseUtils');
const { getAddressFromCoordinates, calculateDistance } = require('../utils/locationUtils');
const redisClient = require('../config/redis');
const mongoose = require('mongoose');

/**
 * Get customer profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getProfile = async (req, res) => {
  try {
    const customerId = req.user._id;
    
    // Get customer data without sensitive information
    const customer = await User.findById(customerId).select('-password -refreshToken');
    
    if (!customer) {
      return sendError(res, 404, 'Customer not found');
    }
    
    return sendSuccess(res, 200, 'Customer profile retrieved successfully', { customer });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update customer profile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateProfile = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { firstName, lastName, email } = req.body;
    
    // Create update object with only allowed fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    
    // Update customer data
    const customer = await User.findByIdAndUpdate(
      customerId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password -refreshToken');
    
    if (!customer) {
      return sendError(res, 404, 'Customer not found');
    }
    
    return sendSuccess(res, 200, 'Customer profile updated successfully', { customer });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Add a new address for customer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const addAddress = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { 
      name, 
      phone, 
      addressLine1, 
      addressLine2, 
      city, 
      state, 
      pincode, 
      landmark,
      location,
      addressType,
      isDefault
    } = req.body;
    
    // Validate required fields
    if (!name || !phone || !addressLine1 || !city || !state || !pincode || !location) {
      return sendError(res, 400, 'Required address fields are missing');
    }
    
    if (!location.coordinates || location.coordinates.length !== 2) {
      return sendError(res, 400, 'Valid location coordinates are required');
    }
    
    // Get location name from coordinates
    let locationName = '';
    try {
      const [longitude, latitude] = location.coordinates;
      const addressInfo = await getAddressFromCoordinates(latitude, longitude);
      locationName = addressInfo.fullAddress;
    } catch (error) {
      console.error('Error fetching location name:', error);
      // Continue with address creation even if location name fetch fails
    }
    
    // Create new address
    const address = new Address({
      user: customerId,
      name,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      landmark,
      location: {
        type: 'Point',
        coordinates: location.coordinates,
        locationName
      },
      addressType: addressType || 'HOME',
      isDefault: isDefault || false
    });
    
    await address.save();
    
    return sendSuccess(res, 201, 'Address added successfully', { address });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get all addresses for a customer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAddresses = async (req, res) => {
  try {
    const customerId = req.user._id;
    
    // Get all addresses for customer
    const addresses = await Address.find({ user: customerId }).sort({ isDefault: -1, createdAt: -1 });
    
    return sendSuccess(res, 200, 'Addresses retrieved successfully', { addresses });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update an existing address
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateAddress = async (req, res) => {
  try {
    const customerId = req.user._id;
    const addressId = req.params.id;
    const updateData = req.body;
    
    // Find address
    const address = await Address.findOne({ _id: addressId, user: customerId });
    
    if (!address) {
      return sendError(res, 404, 'Address not found');
    }
    
    // Check if location coordinates are being updated
    if (updateData.location && updateData.location.coordinates) {
      try {
        const [longitude, latitude] = updateData.location.coordinates;
        const addressInfo = await getAddressFromCoordinates(latitude, longitude);
        updateData.location.locationName = addressInfo.fullAddress;
      } catch (error) {
        console.error('Error fetching location name:', error);
        // Continue with address update even if location name fetch fails
      }
    }
    
    // Update address
    const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      updateData,
      { new: true, runValidators: true }
    );
    
    return sendSuccess(res, 200, 'Address updated successfully', { address: updatedAddress });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Delete an address
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteAddress = async (req, res) => {
  try {
    const customerId = req.user._id;
    const addressId = req.params.id;
    
    // Find and delete address
    const address = await Address.findOneAndDelete({ _id: addressId, user: customerId });
    
    if (!address) {
      return sendError(res, 404, 'Address not found');
    }
    
    // If the deleted address was the default one, set another one as default
    if (address.isDefault) {
      const nextAddress = await Address.findOne({ user: customerId });
      if (nextAddress) {
        nextAddress.isDefault = true;
        await nextAddress.save();
      }
    }
    
    return sendSuccess(res, 200, 'Address deleted successfully');
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Set an address as default
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const setDefaultAddress = async (req, res) => {
  try {
    const customerId = req.user._id;
    const addressId = req.params.id;
    
    // Find address
    const address = await Address.findOne({ _id: addressId, user: customerId });
    
    if (!address) {
      return sendError(res, 404, 'Address not found');
    }
    
    // Reset all addresses to non-default
    await Address.updateMany(
      { user: customerId },
      { isDefault: false }
    );
    
    // Set selected address as default
    address.isDefault = true;
    await address.save();
    
    return sendSuccess(res, 200, 'Default address updated successfully', { address });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Add a product to cart
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const addToCart = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { productId, quantity } = req.body;
    
    // Validate required fields
    if (!productId) {
      return sendError(res, 400, 'Product ID is required');
    }
    
    const productQty = quantity || 1;
    
    // Get product details
    const product = await Product.findById(productId);
    
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    
    if (!product.inStock) {
      return sendError(res, 400, 'Product is out of stock');
    }
    
    const vendorId = product.vendor;
    
    // Find customer's cart for this vendor or create a new one
    let cart = await Cart.findOne({ customer: customerId, vendor: vendorId });
    
    if (!cart) {
      // Create new cart if doesn't exist
      cart = new Cart({
        customer: customerId,
        vendor: vendorId,
        items: []
      });
    }
    
    // Check if product already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );
    
    if (existingItemIndex > -1) {
      // Update quantity if product already in cart
      cart.items[existingItemIndex].quantity = productQty;
    } else {
      // Add new item to cart
      cart.items.push({
        product: productId,
        quantity: productQty,
        price: product.discountPrice > 0 ? product.discountPrice : product.price
      });
    }
    
    // Calculate cart subtotal
    cart.calculateSubtotal();
    
    // Save cart
    await cart.save();
    
    // Populate product details in cart
    await cart.populate('items.product');
    
    return sendSuccess(res, 200, 'Product added to cart successfully', { cart });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Remove a product from cart
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const removeFromCart = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { productId } = req.body;
    
    // Validate required fields
    if (!productId) {
      return sendError(res, 400, 'Product ID is required');
    }
    
    // Get product details to identify vendor
    const product = await Product.findById(productId);
    
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    
    const vendorId = product.vendor;
    
    // Find customer's cart for this vendor
    const cart = await Cart.findOne({ customer: customerId, vendor: vendorId });
    
    if (!cart) {
      return sendError(res, 404, 'Cart not found');
    }
    
    // Remove product from cart items
    cart.items = cart.items.filter(item => item.product.toString() !== productId);
    
    // If cart is empty, delete it
    if (cart.items.length === 0) {
      await Cart.findByIdAndDelete(cart._id);
      return sendSuccess(res, 200, 'Product removed and cart deleted successfully');
    }
    
    // Calculate cart subtotal
    cart.calculateSubtotal();
    
    // Save cart
    await cart.save();
    
    // Populate product details in cart
    await cart.populate('items.product');
    
    return sendSuccess(res, 200, 'Product removed from cart successfully', { cart });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Update product quantity in cart
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateCartItem = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { productId, quantity } = req.body;
    
    // Validate required fields
    if (!productId || !quantity) {
      return sendError(res, 400, 'Product ID and quantity are required');
    }
    
    // Get product details to identify vendor
    const product = await Product.findById(productId);
    
    if (!product) {
      return sendError(res, 404, 'Product not found');
    }
    
    const vendorId = product.vendor;
    
    // Find customer's cart for this vendor
    const cart = await Cart.findOne({ customer: customerId, vendor: vendorId });
    
    if (!cart) {
      return sendError(res, 404, 'Cart not found');
    }
    
    // Find item index in cart
    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    
    if (itemIndex === -1) {
      return sendError(res, 404, 'Product not found in cart');
    }
    
    // Update quantity
    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }
    
    // If cart is empty, delete it
    if (cart.items.length === 0) {
      await Cart.findByIdAndDelete(cart._id);
      return sendSuccess(res, 200, 'Cart is now empty and has been deleted');
    }
    
    // Calculate cart subtotal
    cart.calculateSubtotal();
    
    // Save cart
    await cart.save();
    
    // Populate product details in cart
    await cart.populate('items.product');
    
    return sendSuccess(res, 200, 'Cart updated successfully', { cart });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get customer's cart
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getCart = async (req, res) => {
  try {
    const customerId = req.user._id;
    
    // Get all carts for customer
    const carts = await Cart.find({ customer: customerId })
      .populate('vendor', 'firstName lastName')
      .populate('items.product');
    
    return sendSuccess(res, 200, 'Carts retrieved successfully', { carts });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Clear customer's cart
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const clearCart = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { vendorId } = req.body;
    
    if (vendorId) {
      // Clear specific vendor cart
      await Cart.findOneAndDelete({ customer: customerId, vendor: vendorId });
    } else {
      // Clear all carts
      await Cart.deleteMany({ customer: customerId });
    }
    
    return sendSuccess(res, 200, 'Cart cleared successfully');
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Create an order (checkout)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createOrder = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { cartId, addressId, paymentMethod } = req.body;
    
    // Validate required fields
    if (!cartId || !addressId || !paymentMethod) {
      return sendError(res, 400, 'Cart ID, address ID, and payment method are required');
    }
    
    // Get cart details
    const cart = await Cart.findOne({ _id: cartId, customer: customerId })
      .populate('items.product');
    
    if (!cart) {
      return sendError(res, 404, 'Cart not found');
    }
    
    if (cart.items.length === 0) {
      return sendError(res, 400, 'Cart is empty');
    }
    
    // Get address details
    const address = await Address.findOne({ _id: addressId, user: customerId });
    
    if (!address) {
      return sendError(res, 404, 'Address not found');
    }
    
    // Calculate delivery fee based on distance
    const vendorData = await User.findById(cart.vendor);
    let deliveryFee = 40; // Base delivery fee
    
    if (vendorData && vendorData.location && address.location) {
      const vendorCoords = vendorData.location.coordinates;
      const customerCoords = address.location.coordinates;
      
      if (vendorCoords && customerCoords) {
        const distance = calculateDistance(
          customerCoords[1], // latitude
          customerCoords[0], // longitude
          vendorCoords[1],   // latitude
          vendorCoords[0]    // longitude
        );
        
        // Adjust delivery fee based on distance
        // $40 base fee + $5 per km after first 2km
        deliveryFee = 40 + (Math.max(0, distance - 2) * 5);
        deliveryFee = Math.round(deliveryFee); // Round to nearest rupee
      }
    }
    
    // Calculate tax (assumed as 5% of subtotal)
    const tax = Math.round(cart.subtotal * 0.05);
    
    // Calculate total
    const total = cart.subtotal + deliveryFee + tax;
    
    // Create order items
    const orderItems = cart.items.map(item => ({
      product: item.product._id,
      quantity: item.quantity,
      price: item.price,
      name: item.product.name,
      unit: item.product.unit
    }));
    
    // Create new order
    const order = new Order({
      orderNumber: `OLV${Date.now()}`, // Will be auto-generated in pre-save hook
      customer: customerId,
      vendor: cart.vendor,
      items: orderItems,
      deliveryAddress: {
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        location: address.location
      },
      subtotal: cart.subtotal,
      deliveryFee,
      tax,
      discount: 0, // No discount in this basic implementation
      total,
      paymentMethod,
      paymentStatus: paymentMethod === PAYMENT_METHOD.CASH_ON_DELIVERY 
        ? PAYMENT_STATUS.PENDING 
        : PAYMENT_STATUS.PAID, // Simplified for demo
      status: ORDER_STATUS.PENDING,
      statusHistory: [
        {
          status: ORDER_STATUS.PENDING,
          timestamp: new Date(),
          updatedBy: customerId
        }
      ]
    });
    
    await order.save();
    
    // Delete the cart after order creation
    await Cart.findByIdAndDelete(cart._id);
    
    return sendSuccess(res, 201, 'Order created successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get customer's orders
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getOrders = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { status, limit = 10, page = 1 } = req.query;
    
    // Build query
    const query = { customer: customerId };
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
      .populate('vendor', 'firstName lastName')
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
    const customerId = req.user._id;
    const orderId = req.params.id;
    
    // Get order details
    const order = await Order.findOne({ _id: orderId, customer: customerId })
      .populate('vendor', 'firstName lastName phone location')
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
 * Cancel an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const cancelOrder = async (req, res) => {
  try {
    const customerId = req.user._id;
    const orderId = req.params.id;
    const { reason } = req.body;
    
    // Get order
    const order = await Order.findOne({ _id: orderId, customer: customerId });
    
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    
    // Check if order can be cancelled
    const cancelableStatuses = [ORDER_STATUS.PENDING, ORDER_STATUS.ACCEPTED];
    
    if (!cancelableStatuses.includes(order.status)) {
      return sendError(res, 400, `Cannot cancel order in ${order.status} status`);
    }
    
    // Update order status
    order.status = ORDER_STATUS.CANCELLED;
    order.cancellationReason = reason || 'Cancelled by customer';
    
    // Add status history entry
    order.statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      timestamp: new Date(),
      updatedBy: customerId,
      notes: reason || 'Cancelled by customer'
    });
    
    await order.save();
    
    return sendSuccess(res, 200, 'Order cancelled successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Rate and review an order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const rateOrder = async (req, res) => {
  try {
    const customerId = req.user._id;
    const orderId = req.params.id;
    const { rating, review } = req.body;
    
    // Validate required fields
    if (!rating || rating < 1 || rating > 5) {
      return sendError(res, 400, 'Rating is required and must be between 1 and 5');
    }
    
    // Get order
    const order = await Order.findOne({ _id: orderId, customer: customerId });
    
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    
    // Check if order is completed
    if (order.status !== ORDER_STATUS.DELIVERED) {
      return sendError(res, 400, 'Can only rate delivered orders');
    }
    
    // Update order with rating and review
    order.rating = rating;
    order.review = review;
    await order.save();
    
    // Update product ratings (assuming we rate all items in the order with the same rating)
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      
      if (product) {
        // Simple moving average for ratings
        const newTotalReviews = product.totalReviews + 1;
        const newAvgRating = ((product.avgRating * product.totalReviews) + rating) / newTotalReviews;
        
        product.totalReviews = newTotalReviews;
        product.avgRating = newAvgRating;
        await product.save();
      }
    }
    
    return sendSuccess(res, 200, 'Order rated successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Checkout and create a new order
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const checkout = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { addressId, paymentMethod, deliveryNote } = req.body;
    
    // Get customer's cart
    const cart = await Cart.findOne({ customer: customerId })
      .populate('items.product');
    
    if (!cart || !cart.items || cart.items.length === 0) {
      return sendError(res, 400, 'Your cart is empty');
    }
    
    // Get delivery address
    const address = await Address.findOne({
      _id: addressId,
      user: customerId
    });
    
    if (!address) {
      return sendError(res, 404, 'Delivery address not found');
    }
    
    // Validate products and calculate order details
    const vendorId = cart.vendor;
    const orderItems = [];
    let subtotal = 0;
    
    for (const item of cart.items) {
      const product = item.product;
      
      // Ensure product is in stock
      if (!product.inStock || product.quantity < item.quantity) {
        return sendError(res, 400, `${product.name} is out of stock or has insufficient quantity`);
      }
      
      // Create order item
      const orderItem = {
        product: product._id,
        quantity: item.quantity,
        price: product.discountPrice > 0 ? product.discountPrice : product.price,
        name: product.name,
        unit: product.unit
      };
      
      orderItems.push(orderItem);
      subtotal += orderItem.price * orderItem.quantity;
    }
    
    // Calculate delivery fee based on distance
    const vendorData = await User.findById(vendorId).select('location');
    const deliveryFee = calculateDeliveryFee(
      address.location.coordinates,
      vendorData.location.coordinates
    );
    
    // Calculate tax (simplified for demo)
    const taxRate = 0.05; // 5% tax
    const tax = subtotal * taxRate;
    
    // Apply any applicable promotions (simplified)
    const discount = 0; // Implement promotion logic here
    
    // Calculate total
    const total = subtotal + deliveryFee + tax - discount;
    
    // Create a new order
    const order = new Order({
      customer: customerId,
      vendor: vendorId,
      items: orderItems,
      deliveryAddress: {
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || '',
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        location: address.location
      },
      subtotal,
      deliveryFee,
      tax,
      discount,
      total,
      paymentMethod,
      deliveryNote,
      status: ORDER_STATUS.PENDING,
      statusHistory: [{
        status: ORDER_STATUS.PENDING,
        timestamp: new Date(),
        updatedBy: customerId
      }]
    });
    
    // Save the order
    await order.save();
    
    // Update product quantities
    for (const item of cart.items) {
      await Product.findByIdAndUpdate(
        item.product._id,
        { $inc: { quantity: -item.quantity } }
      );
    }
    
    // Clear the customer's cart
    await Cart.findByIdAndDelete(cart._id);
    
    // Create a socket for real-time tracking
    const io = req.app.get('socketio');
    if (io) {
      io.emit('new-order', { orderId: order._id, vendorId });
    }
    
    return sendSuccess(res, 201, 'Order placed successfully', { order });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get real-time order tracking
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const trackOrder = async (req, res) => {
  try {
    const customerId = req.user._id;
    const orderId = req.params.id;
    
    // Get order and ensure it belongs to this customer
    const order = await Order.findOne({
      _id: orderId,
      customer: customerId
    })
    .populate('vendor', 'firstName lastName phone location')
    .populate('deliveryAgent', 'firstName lastName phone');
    
    if (!order) {
      return sendError(res, 404, 'Order not found');
    }
    
    // Get latest delivery agent location from Redis if available
    let agentLocation = null;
    if (order.deliveryAgent) {
      const locationData = await redisClient.get(`delivery_location:${order.deliveryAgent._id}`);
      if (locationData) {
        agentLocation = JSON.parse(locationData);
      }
    }
    
    // Get tracking data
    const trackingData = {
      order,
      status: order.status,
      statusHistory: order.statusHistory,
      estimatedDeliveryTime: order.estimatedDeliveryTime,
      agentLocation,
      vendor: {
        location: order.vendor.location
      }
    };
    
    return sendSuccess(res, 200, 'Order tracking data retrieved successfully', { tracking: trackingData });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Calculate delivery fee based on distance
 * @param {Array} customerCoords - Customer coordinates [lng, lat]
 * @param {Array} vendorCoords - Vendor coordinates [lng, lat]
 * @returns {Number} Delivery fee
 */
const calculateDeliveryFee = (customerCoords, vendorCoords) => {
  // Calculate distance between customer and vendor
  const distanceInKm = calculateDistance(
    customerCoords[1], // latitude
    customerCoords[0], // longitude
    vendorCoords[1],   // latitude
    vendorCoords[0]    // longitude
  );
  
  // Base delivery fee
  const baseFee = 30;
  
  // Additional fee per km
  const perKmFee = 10;
  
  // Calculate total delivery fee
  return Math.ceil(baseFee + (distanceInKm * perKmFee));
};

/**
 * Update customer location
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateLocation = async (req, res) => {
  try {
    const customerId = req.user._id;
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
    
    // Update location
    const customer = await User.findByIdAndUpdate(
      customerId,
      {
        location: {
          type: 'Point',
          coordinates,
          locationName
        }
      },
      { new: true }
    ).select('-password -refreshToken');
    
    if (!customer) {
      return sendError(res, 404, 'Customer not found');
    }
    
    // Also update in Redis for real-time access
    await redisClient.set(
      `customer_location:${customerId}`,
      JSON.stringify({
        customerId,
        coordinates,
        locationName,
        updatedAt: new Date()
      }),
      'EX',
      300 // Expire in 5 minutes if not updated
    );
    
    return sendSuccess(res, 200, 'Location updated successfully', { location: customer.location });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get customer location
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getLocation = async (req, res) => {
  try {
    const customerId = req.user._id;
    
    // Try to get from Redis first (most up-to-date)
    const redisLocation = await redisClient.get(`customer_location:${customerId}`);
    if (redisLocation) {
      const locationData = JSON.parse(redisLocation);
      return sendSuccess(res, 200, 'Location retrieved successfully', { location: locationData });
    }
    
    // If not in Redis, get from database
    const customer = await User.findById(customerId).select('location');
    
    if (!customer) {
      return sendError(res, 404, 'Customer not found');
    }
    
    return sendSuccess(res, 200, 'Location retrieved successfully', { location: customer.location });
  } catch (error) {
    return handleApiError(res, error);
  }
};

/**
 * Get nearby stores based on customer location
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getNearbyStores = async (req, res) => {
  try {
    const customerId = req.user._id;
    const { maxDistance = 10, pinCode } = req.query; // Default to 10km if not specified
    
    // Get customer location
    let customerCoords;
    
    // First check if customer provided location in query
    if (req.query.lat && req.query.lng) {
      customerCoords = [parseFloat(req.query.lng), parseFloat(req.query.lat)];
    } else {
      // Try to get from Redis first (most up-to-date)
      const redisKey = `customer_location:${customerId}`;
      const redisLocation = await redisClient.get(redisKey);
      
      if (redisLocation) {
        const locationData = JSON.parse(redisLocation);
        customerCoords = locationData.coordinates;
      } else {
        // If not in Redis, get from database
        const customer = await User.findById(customerId).select('location');
        
        if (!customer || !customer.location || !customer.location.coordinates) {
          return sendError(res, 400, 'Customer location not available. Please update your location or provide lat/lng in the request.');
        }
        
        customerCoords = customer.location.coordinates;
      }
    }
    
    // Validate coordinates
    if (!customerCoords || customerCoords.length !== 2) {
      return sendError(res, 400, 'Invalid customer coordinates');
    }
    
    // Find vendors based on pinCode if provided
    let query = {
      role: USER_ROLES.VENDOR,
      status: USER_STATUS.ACTIVE
    };
    
    if (pinCode) {
      query['storeDetails.pinCode'] = pinCode;
    }
    
    // Find active vendors
    const vendors = await User.find(query)
      .select('fullName storeDetails location walletBalance')
      .lean();
    
    // Filter vendors based on delivery radius
    const nearbyStores = vendors.filter(vendor => {
      // Skip vendors without location or coordinates
      if (!vendor.location || !vendor.location.coordinates || 
          !vendor.location.coordinates[0] || !vendor.location.coordinates[1]) {
        return false;
      }
      
      // Calculate distance between customer and vendor
      const vendorCoords = vendor.location.coordinates;
      const distance = calculateDistance(
        customerCoords[1], // latitude
        customerCoords[0], // longitude
        vendorCoords[1],   // latitude
        vendorCoords[0]    // longitude
      );
      
      // Add distance to vendor object for frontend
      vendor.distance = distance.toFixed(2);
      
      // Get vendor's delivery radius (default to 5km if not set)
      const vendorDeliveryRadius = 
        (vendor.storeDetails && vendor.storeDetails.deliveryRadiusKm) 
          ? vendor.storeDetails.deliveryRadiusKm 
          : 5;
      
      // Check if customer is within vendor's delivery radius
      vendor.isDeliveryAvailable = distance <= vendorDeliveryRadius;
      
      // Return vendors that are within the requested max distance
      // We still return vendors outside their delivery radius, but mark them as unavailable
      return distance <= parseFloat(maxDistance);
    });
    
    // Sort by distance
    nearbyStores.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    
    return sendSuccess(res, 200, 'Nearby stores retrieved successfully', { 
      stores: nearbyStores,
      totalStores: nearbyStores.length,
      availableForDelivery: nearbyStores.filter(store => store.isDeliveryAvailable).length
    });
  } catch (error) {
    return handleApiError(res, error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  addAddress,
  getAddresses,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  addToCart,
  removeFromCart,
  updateCartItem,
  getCart,
  clearCart,
  createOrder,
  getOrders,
  getOrderDetails,
  cancelOrder,
  rateOrder,
  checkout,
  trackOrder,
  updateLocation,
  getLocation,
  getNearbyStores
}; 