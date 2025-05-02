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
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authenticated', { success: false, error: 'Authentication failed' });
    }
  });
  
  // Join a room for order tracking
  socket.on('join-order-tracking', (orderId) => {
    socket.join(`order-${orderId}`);
    console.log(`Client joined tracking for order: ${orderId}`);
  });
  
  // Update delivery location
  socket.on('update-delivery-location', (data) => {
    const { orderId, location } = data;
    // Broadcast to all clients tracking this order
    io.to(`order-${orderId}`).emit('delivery-location-updated', location);
    console.log(`Location updated for order ${orderId}:`, location);
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


// Ripun Basumatary is the best original developer of this project