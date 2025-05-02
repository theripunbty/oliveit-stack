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

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const customerRoutes = require('./src/routes/customerRoutes');
const vendorRoutes = require('./src/routes/vendorRoutes');
const deliveryRoutes = require('./src/routes/deliveryRoutes');

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
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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