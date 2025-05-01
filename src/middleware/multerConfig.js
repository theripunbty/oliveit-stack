const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Define storage directories
const UPLOAD_DIR = 'uploads';
const PROFILE_DIR = `${UPLOAD_DIR}/profiles`;
const PRODUCT_DIR = `${UPLOAD_DIR}/products`;
const KYC_DIR = `${UPLOAD_DIR}/kyc`;
const CATEGORY_DIR = `${UPLOAD_DIR}/categories`;
const STORE_DIR = `${UPLOAD_DIR}/stores`;
const REGISTRATION_DIR = `${UPLOAD_DIR}/registration`;

// Create directories if they don't exist
[UPLOAD_DIR, PROFILE_DIR, PRODUCT_DIR, KYC_DIR, CATEGORY_DIR, STORE_DIR, REGISTRATION_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = UPLOAD_DIR;
    
    // Determine appropriate directory based on file type
    if (file.fieldname.includes('profile')) {
      uploadPath = PROFILE_DIR;
    } else if (file.fieldname.includes('product')) {
      uploadPath = PRODUCT_DIR;
    } else if (file.fieldname.includes('kyc') || file.fieldname.includes('document')) {
      uploadPath = KYC_DIR;
    } else if (file.fieldname.includes('category')) {
      uploadPath = CATEGORY_DIR;
    } else if (file.fieldname.includes('store')) {
      uploadPath = STORE_DIR;
    } else if (file.fieldname.includes('registration')) {
      uploadPath = REGISTRATION_DIR;
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Create unique filename with original extension
    const uniquePrefix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, uniquePrefix + extension);
  }
});

// File filter to allow only images
const imageFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// File filter to allow images and PDFs (for KYC documents)
const documentFilter = (req, file, cb) => {
  // Accept images and PDF files
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only image or PDF files are allowed!'), false);
  }
};

// Create different multer instances for different upload types
const profileUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

const productUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const kycUpload = multer({
  storage,
  fileFilter: documentFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const categoryUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

const storeUpload = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

const registrationUpload = multer({
  storage,
  fileFilter: documentFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

module.exports = {
  profileUpload,
  productUpload,
  kycUpload,
  categoryUpload,
  storeUpload,
  registrationUpload,
  UPLOAD_DIR,
  PROFILE_DIR,
  PRODUCT_DIR,
  KYC_DIR,
  CATEGORY_DIR,
  STORE_DIR,
  REGISTRATION_DIR
}; 