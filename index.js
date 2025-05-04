require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIO = require('socket.io');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const connectDB = require('./src/config/database');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');
const { verifyAccessToken } = require('./src/utils/jwtUtils');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const customerRoutes = require('./src/routes/customerRoutes');
const vendorRoutes = require('./src/routes/vendorRoutes');
const deliveryRoutes = require('./src/routes/deliveryRoutes');
const supportRoutes = require('./src/routes/supportRoutes');

// Load Swagger documentation
const swaggerDocument = YAML.load(path.join(__dirname, './src/docs/swagger.yaml'));

// Initialize Express app and HTTP server for Socket.IO
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Static files
app.use('/uploads', express.static('uploads'));

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/support', supportRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to OliveIt Grocery API',
    documentation: '/api-docs'
  });
});

// Socket.IO setup
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // Socket authentication
  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      if (!token) {
        console.log('Socket authentication failed: No token provided');
        return;
      }
      
      // Verify token
      const decoded = verifyAccessToken(token);
      if (!decoded || !decoded.userId) {
        console.log('Socket authentication failed: Invalid token');
        return;
      }
      
      // Store user info on socket for later use
      socket.user = {
        id: decoded.userId,
        role: decoded.role
      };
      
      console.log(`Socket authenticated: ${socket.id} as ${decoded.role} (${decoded.userId})`);
      socket.emit('authenticated', { success: true });
      
      // Automatically join role-specific channels
      if (decoded.role === 'customer') {
        socket.join(`customer-${decoded.userId}`);
      } else if (decoded.role === 'delivery') {
        socket.join(`delivery-${decoded.userId}`);
      } else if (decoded.role === 'vendor') {
        socket.join(`vendor-${decoded.userId}`);
      }
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authenticated', { success: false, error: 'Authentication failed' });
    }
  });
  
  // Join a room for order tracking
  socket.on('join-order-tracking', (orderId) => {
    socket.join(`order-${orderId}`);
    console.log(`Client joined tracking for order: ${orderId}`);
    
    // Emit current status to the newly joined client
    try {
      const redisClient = require('./src/config/redis');
      redisClient.get(`order_delivery_location:${orderId}`, (err, location) => {
        if (!err && location) {
          socket.emit('delivery-location-updated', {
            orderId,
            location: JSON.parse(location)
          });
        }
      });
    } catch (error) {
      console.error('Error retrieving cached location:', error);
    }
  });
  
  // Update delivery location
  socket.on('update-delivery-location', (data) => {
    try {
      const { orderId, location } = data;
      
      if (!socket.user || socket.user.role !== 'delivery') {
        console.log('Unauthorized location update attempt');
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }
      
      if (!orderId || !location || !location.coordinates) {
        console.log('Invalid location data received');
        socket.emit('error', { message: 'Invalid location data' });
        return;
      }
      
      // Save to Redis for persistence between connections
      const redisClient = require('./src/config/redis');
      const locationData = {
        ...location,
        agentId: socket.user.id,
        updatedAt: new Date().toISOString()
      };
      
      redisClient.set(
        `order_delivery_location:${orderId}`,
        JSON.stringify(locationData),
        'EX',
        300 // Expire in 5 minutes
      );
      
      // Broadcast to all clients tracking this order
      io.to(`order-${orderId}`).emit('delivery-location-updated', {
        orderId,
        location: locationData
      });
      
      console.log(`Location updated for order ${orderId}:`, locationData.coordinates);
    } catch (error) {
      console.error('Error in socket delivery location update:', error);
    }
  });
  
  // Delivery status updates
  socket.on('delivery-status-update', (data) => {
    try {
      const { orderId, status, estimatedArrival, message } = data;
      
      if (!socket.user || socket.user.role !== 'delivery') {
        console.log('Unauthorized status update attempt');
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }
      
      if (!orderId || !status) {
        console.log('Invalid status data received');
        socket.emit('error', { message: 'Invalid status data' });
        return;
      }
      
      const statusData = {
        orderId,
        status,
        agentId: socket.user.id,
        timestamp: new Date().toISOString(),
        estimatedArrival,
        message
      };
      
      // Broadcast status update to all clients tracking this order
      io.to(`order-${orderId}`).emit('delivery-status-changed', statusData);
      
      console.log(`Status updated for order ${orderId}:`, status);
    } catch (error) {
      console.error('Error in socket delivery status update:', error);
    }
  });
  
  // Join support chat room
  socket.on('join-support-chat', (chatId) => {
    socket.join(`chat-${chatId}`);
    if (socket.user) {
      console.log(`Client joined support chat: ${chatId} (User: ${socket.user.id}, Role: ${socket.user.role})`);
    } else {
      console.log(`Client joined support chat: ${chatId} (Unauthenticated)`);
    }
  });
  
  // Send support message
  socket.on('send-support-message', (data) => {
    const { chatId, message } = data;
    
    // Add authenticated user info if available
    if (socket.user && message) {
      message.senderId = message.senderId || socket.user.id;
      message.senderType = message.senderType || (socket.user.role === 'admin' ? 'admin' : 'user');
      console.log(`Authenticated message in chat ${chatId} from ${socket.user.role} (${socket.user.id})`);
    }
    
    // Broadcast message to all clients in this chat room
    io.to(`chat-${chatId}`).emit('support-message-received', message);
    console.log(`Message sent in chat ${chatId}:`, message?.content || 'No content');
  });
  
  // Support agent typing indicator
  socket.on('support-typing', (data) => {
    const { chatId, isTyping, user } = data;
    socket.to(`chat-${chatId}`).emit('support-typing-status', { isTyping, user });
  });
  
  // Disconnect event
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// After setting up routes and before the error handling
// Add a cron-like job to clean up inactive chats

const cleanupInactiveChats = async () => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const SupportChat = require('./src/models/SupportChat');
    const result = await SupportChat.deleteMany({
      lastMessageTime: { $lt: thirtyMinutesAgo },
      status: { $ne: 'resolved' } // Don't delete resolved chats automatically
    });
    
    if (result.deletedCount > 0) {
      console.log(`[${new Date().toISOString()}] Auto-cleanup: Deleted ${result.deletedCount} inactive chats`);
    }
  } catch (error) {
    console.error('Error during auto-cleanup of inactive chats:', error);
  }
};

// Run cleanup every 15 minutes
setInterval(cleanupInactiveChats, 15 * 60 * 1000);

// Make io accessible to route handlers
app.set('socketio', io);

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
}); 
// server.listen(PORT, '192.168.29.211', () => {
//   console.log(`Server running on http://192.168.29.211:${PORT}`);
//   console.log(`API Documentation available at http://192.168.29.211:${PORT}/api-docs`);
// });
 


// Ripun Basumatary is the best original developer of this project