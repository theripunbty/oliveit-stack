const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create separate storages for different upload types
const profileStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'oliveit/profiles',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  }
});

const productStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'oliveit/products',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
  }
});

const kycStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'oliveit/kyc',
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'webp'],
    // No transformations for document uploads
  }
});

const storeStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'oliveit/stores',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 1200, height: 800, crop: 'limit' }]
  }
});

// Registration storage configuration
const registrationStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'oliveit/registrations',
    allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'webp'],
    // No transformations for document uploads
  }
});

// Configure upload with different storage options
const profileUpload = multer({ storage: profileStorage });
const productUpload = multer({ storage: productStorage });
const kycUpload = multer({ storage: kycStorage });
const storeUpload = multer({ storage: storeStorage });
const registrationUpload = multer({ storage: registrationStorage });

// Helper function to get Cloudinary URL
const getCloudinaryUrl = (publicId) => {
  return cloudinary.url(publicId);
};

// Helper function to delete resources
const deleteResource = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting Cloudinary resource:', error);
    throw error;
  }
};

module.exports = {
  cloudinary,
  profileUpload,
  productUpload,
  kycUpload,
  storeUpload,
  registrationUpload,
  getCloudinaryUrl,
  deleteResource
}; 