const redisClient = require('../config/redis');

/**
 * Generate a random 6-digit OTP
 * @returns {String} 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Store OTP in Redis with expiry time
 * @param {String} phone - Phone number
 * @param {String} otp - Generated OTP
 * @returns {Promise} Redis operation promise
 */
const storeOTP = async (phone, otp) => {
  const key = `otp:${phone}`;
  const expiryInSeconds = process.env.OTP_EXPIRY || 300; // Default 5 minutes
  
  try {
    await redisClient.set(key, otp, 'EX', expiryInSeconds);
    return true;
  } catch (error) {
    console.error('Error storing OTP in Redis:', error);
    throw error;
  }
};

/**
 * Verify OTP from Redis
 * @param {String} phone - Phone number
 * @param {String} otp - OTP to verify
 * @returns {Promise<Boolean>} True if OTP is valid
 */
const verifyOTP = async (phone, otp) => {
  const key = `otp:${phone}`;
  
  try {
    const storedOTP = await redisClient.get(key);
    
    if (!storedOTP) {
      return false; // OTP expired or never existed
    }
    
    const isValid = storedOTP === otp;
    
    if (isValid) {
      // Delete the OTP after successful verification
      await redisClient.del(key);
    }
    
    return isValid;
  } catch (error) {
    console.error('Error verifying OTP from Redis:', error);
    throw error;
  }
};

/**
 * Send OTP via SMS (placeholder for actual SMS service integration)
 * @param {String} phone - Phone number
 * @param {String} otp - OTP to send
 * @returns {Promise<Boolean>} True if OTP sent successfully
 */
const sendOTP = async (phone, otp) => {
  // In a real-world scenario, this function would integrate with an SMS service
  // like Twilio, MessageBird, or a regional SMS gateway provider
  
  try {
    // Simulate successful sending
    console.log(`[SIMULATED SMS] Sending OTP ${otp} to ${phone}`);
    return true;
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw error;
  }
};

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  sendOTP
}; 