const Redis = require('ioredis');

// Create Redis client for Upstash Redis
const redisClient = new Redis({
  port: process.env.REDIS_PORT || 6379,
  host: process.env.REDIS_HOST || 'lenient-toucan-24706.upstash.io',
  password: process.env.REDIS_PASSWORD || 'AWCCAAIjcDFmNjhmN2I0MGYyMTI0OTliYTY3YjUxYjAyYzBhZWUyZHAxMA',
  tls: {
    rejectUnauthorized: false
  }
});

redisClient.on('connect', () => {
  console.log('Redis client connected');
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

module.exports = redisClient; 