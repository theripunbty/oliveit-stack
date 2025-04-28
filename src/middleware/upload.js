const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const createDirIfNotExists = (dirPath) => {
  const fullPath = path.join(__dirname, '../../uploads', dirPath);
  if (!fs.existsSync(fullPath)) {
    try {
      fs.mkdirSync(fullPath, { recursive: true });
    } catch (err) {
      console.error(`Error creating directory ${fullPath}:`, err);
    }
  }
};

// Create upload directories
['profiles', 'products', 'categories', 'banners', 'kyc'].forEach(createDirIfNotExists);

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadDir = 'products'; // Default folder
    
    // Determine folder based on route
    if (req.originalUrl.includes('/profiles') || req.originalUrl.includes('/users')) {
      uploadDir = 'profiles';
    } else if (req.originalUrl.includes('/categories')) {
      uploadDir = 'categories';
    } else if (req.originalUrl.includes('/banners')) {
      uploadDir = 'banners';
    } else if (req.originalUrl.includes('/kyc')) {
      uploadDir = 'kyc';
    }
    
    const destPath = path.join(__dirname, '../../uploads', uploadDir);
    cb(null, destPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, uniqueSuffix + extension);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WebP are allowed.'), false);
  }
};

// Create the multer upload middleware
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

module.exports = upload; 