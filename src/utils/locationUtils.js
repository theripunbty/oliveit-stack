const axios = require('axios');

/**
 * Get address details from latitude and longitude using Google Maps API
 * @param {Number} latitude - Latitude coordinate
 * @param {Number} longitude - Longitude coordinate
 * @returns {Promise<Object>} Location details
 */
const getAddressFromCoordinates = async (latitude, longitude) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${response.data.status}`);
    }

    // Process the Google Maps response to extract useful information
    const results = response.data.results;
    
    if (!results || results.length === 0) {
      throw new Error('No results found for these coordinates');
    }

    // Get the most accurate address (usually the first result)
    const addressComponents = results[0].address_components;
    
    // Initialize variables to hold address parts
    let streetNumber = '';
    let route = '';
    let locality = '';
    let city = '';
    let state = '';
    let country = '';
    let postalCode = '';

    // Extract address components
    addressComponents.forEach(component => {
      const types = component.types;
      
      if (types.includes('street_number')) {
        streetNumber = component.long_name;
      } else if (types.includes('route')) {
        route = component.long_name;
      } else if (types.includes('locality')) {
        locality = component.long_name;
      } else if (types.includes('sublocality')) {
        if (!locality) locality = component.long_name;
      } else if (types.includes('administrative_area_level_2')) {
        city = component.long_name;
      } else if (types.includes('administrative_area_level_1')) {
        state = component.long_name;
      } else if (types.includes('country')) {
        country = component.long_name;
      } else if (types.includes('postal_code')) {
        postalCode = component.long_name;
      }
    });

    // Construct a structured address object
    return {
      fullAddress: results[0].formatted_address,
      streetAddress: `${streetNumber} ${route}`.trim(),
      locality: locality || city,
      city,
      state,
      country,
      postalCode,
      placeId: results[0].place_id
    };
  } catch (error) {
    console.error('Error getting address from coordinates:', error);
    throw error;
  }
};

/**
 * Calculate distance between two sets of coordinates in kilometers
 * @param {Number} lat1 - Latitude of first location
 * @param {Number} lon1 - Longitude of first location
 * @param {Number} lat2 - Latitude of second location
 * @param {Number} lon2 - Longitude of second location
 * @returns {Number} Distance in kilometers
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c; // Distance in km
  
  return distance;
};

/**
 * Convert degrees to radians
 * @param {Number} deg - Degrees
 * @returns {Number} Radians
 */
const deg2rad = (deg) => {
  return deg * (Math.PI/180);
};

/**
 * Get estimated delivery time based on distance
 * @param {Number} distanceInKm - Distance in kilometers
 * @param {Number} baseTimeMinutes - Base time in minutes (default 15)
 * @param {Number} speedKmPerHour - Average speed in km/h (default 20)
 * @returns {Number} Estimated delivery time in minutes
 */
const getEstimatedDeliveryTime = (distanceInKm, baseTimeMinutes = 15, speedKmPerHour = 20) => {
  // Base time for order preparation
  let estimatedMinutes = baseTimeMinutes;
  
  // Add travel time based on distance and average speed
  estimatedMinutes += (distanceInKm / speedKmPerHour) * 60;
  
  // Round up to nearest minute
  return Math.ceil(estimatedMinutes);
};

module.exports = {
  getAddressFromCoordinates,
  calculateDistance,
  getEstimatedDeliveryTime
}; 