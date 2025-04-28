# OliveIt Grocery Delivery API

A comprehensive backend API for a grocery delivery platform with multiple user roles and real-time tracking.

## Tech Stack

- Node.js with Express
- MongoDB Atlas for database
- Upstash Redis for caching and OTP management
- Socket.IO for real-time delivery tracking
- JWT Authentication with refresh tokens
- Google Maps API for geocoding
- Swagger for API documentation

## Features

- Multiple user roles: Customer, Vendor, Delivery Agent, Admin
- Role-based access control
- OTP-based authentication for customers and delivery agents
- Password-based authentication for vendors and admins
- Admin approval flow for vendors and delivery agents
- Product management for vendors
- Order placement and tracking for customers
- Delivery management with real-time location tracking
- Comprehensive dashboard statistics

## Setup Instructions

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file based on the provided template
4. Make sure you have valid credentials for:
   - MongoDB Atlas
   - Upstash Redis
   - Google Maps API
5. Start the server:
   ```
   npm run dev
   ```

## API Documentation

The API documentation is available at `http://localhost:5000/api-docs` when the server is running.

## Environment Variables

The following environment variables are required:

```
# Server Configuration
PORT=5000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=your_mongodb_connection_string

# Redis Configuration (Upstash)
REDIS_HOST=your_redis_host
REDIS_PORT=your_redis_port
REDIS_PASSWORD=your_redis_password

# JWT Configuration
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=3600
JWT_REFRESH_SECRET=your_jwt_refresh_secret
JWT_REFRESH_EXPIRES_IN=604800

# OTP Configuration
OTP_EXPIRY=300

# Google Maps API
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## Running in Production

For production, use:
```
npm start
```

## API Endpoints

### Authentication
- POST `/api/auth/register/customer` - Register a customer
- POST `/api/auth/register/vendor` - Register a vendor
- POST `/api/auth/register/delivery` - Register a delivery agent
- POST `/api/auth/login/customer` - Customer login (OTP)
- POST `/api/auth/login/vendor` - Vendor login
- POST `/api/auth/login/delivery` - Delivery agent login (OTP)
- POST `/api/auth/login/admin` - Admin login
- POST `/api/auth/verify-otp` - Verify OTP
- POST `/api/auth/refresh-token` - Refresh access token

### Admin
- GET `/api/admin/vendors` - Get all vendors
- GET `/api/admin/vendors/:id` - Get vendor details
- PUT `/api/admin/vendors/:id/approve` - Approve vendor
- PUT `/api/admin/vendors/:id/reject` - Reject vendor
- GET `/api/admin/delivery-agents` - Get all delivery agents
- GET `/api/admin/delivery-agents/:id` - Get delivery agent details
- PUT `/api/admin/delivery-agents/:id/approve` - Approve delivery agent
- PUT `/api/admin/delivery-agents/:id/reject` - Reject delivery agent
- GET `/api/admin/customers` - Get all customers
- GET `/api/admin/orders` - Get all orders
- GET `/api/admin/dashboard` - Get dashboard statistics

And many more - see Swagger documentation for complete list. 