const rateLimit = require('express-rate-limit');
const redisClient = require('../config/redis');

// Redis store for rate limiter
const RedisStore = require('rate-limit-redis').default;

// Create Redis store factory function to avoid store reuse
const createRedisStore = (prefix) => {
  return new RedisStore({
    // @ts-expect-error - Known issue with @types/ioredis
    sendCommand: (...args) => redisClient.call(...args),
    prefix: prefix // Add unique prefix for each store
  });
};

// Auth rate limiter - restrict login/registration attempts
const authLimiter = rateLimit({
  store: createRedisStore('auth:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes.'
  }
});

// OTP rate limiter - effectively unlimited
const otpLimiter = rateLimit({
  store: createRedisStore('otp:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // Effectively unlimited for normal use
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests, please try again after 1 hour.'
  }
});

// API rate limiter - general API protection
const apiLimiter = rateLimit({
  store: createRedisStore('api:'),
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});

module.exports = {
  authLimiter,
  otpLimiter,
  apiLimiter
}; 