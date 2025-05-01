# OliveIt Cloudinary Integration Guide

This guide explains how to integrate Cloudinary with the OliveIt Stack project for enhanced image management and storage.

## Why Use Cloudinary?

- **Optimized Delivery**: Cloudinary automatically optimizes images for different devices and resolutions
- **Image Transformations**: Easily resize, crop, and transform images on-the-fly
- **CDN Distribution**: Global content delivery network for fast loading
- **Storage Management**: No need to worry about server storage limitations
- **Backup and Security**: Built-in backup and secure access controls

## Setup Instructions

### 1. Create a Cloudinary Account

1. Sign up for a free account at [Cloudinary](https://cloudinary.com/users/register/free)
2. Once registered, note your:
   - Cloud Name
   - API Key
   - API Secret

### 2. Install Required Packages

```bash
npm install cloudinary multer-storage-cloudinary
```

### 3. Update Environment Variables

Add the following to your `.env` file:

```
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 4. Create Cloudinary Configuration

Create a new file `src/middleware/cloudinaryConfig.js`:

```javascript
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

// Configure upload with different storage options
const profileUpload = multer({ storage: profileStorage });
const productUpload = multer({ storage: productStorage });
const kycUpload = multer({ storage: kycStorage });
const storeUpload = multer({ storage: storeStorage });

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
  getCloudinaryUrl,
  deleteResource
};
```

### 5. Modify Upload Routes

Update your upload routes to use the Cloudinary middleware:

```javascript
const { profileUpload, productUpload, kycUpload, storeUpload } = require('../middleware/cloudinaryConfig');

// Profile image upload route
router.post('/profiles/upload', profileUpload.single('profile'), async (req, res) => {
  try {
    // req.file.path will contain the Cloudinary URL
    return sendSuccess(res, 200, 'Profile image uploaded successfully', {
      imageUrl: req.file.path
    });
  } catch (error) {
    return handleApiError(res, error);
  }
});

// Similar implementations for other upload routes
```

### 6. Update Admin Panel Code

In the admin panel, update the `ensureCompleteUrl` function to handle Cloudinary URLs:

```typescript
const ensureCompleteUrl = (url: string): string => {
  if (!url) return '';
  
  // If the URL is already absolute (starts with http), return it as is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // For Cloudinary URLs (they typically contain res.cloudinary.com)
  if (url.includes('cloudinary.com')) {
    return url;
  }
  
  // For local files, handle as before
  const baseApiUrl = 'https://stack.oliveit.club';
  
  if (url.startsWith('/uploads')) {
    return `${baseApiUrl}${url}`;
  }
  
  if (url.startsWith('uploads/')) {
    return `${baseApiUrl}/${url}`;
  }
  
  return `${baseApiUrl}/${url}`;
};
```

### 7. Best Practices

1. **Use Transformations**: Cloudinary allows for image transformations directly in the URL:
   ```
   https://res.cloudinary.com/your-cloud-name/image/upload/w_500,h_500,c_fill/your-image-name
   ```

2. **Use Secure URLs**: Always use HTTPS URLs for production.

3. **Image Optimization**: Set quality parameters for optimizing images:
   ```javascript
   transformation: [{ width: 800, height: 600, quality: 'auto:good', crop: 'limit' }]
   ```

4. **Backup Strategy**: Regularly backup your Cloudinary media library.

## Common Issues and Solutions

1. **Upload Failures**: Ensure proper API keys and account limitations.
2. **Slow Uploads**: Check network connection and file sizes.
3. **Transformation Issues**: Verify transformation parameters are correct.
4. **Rate Limiting**: Be aware of API call limits on free accounts.

## Testing Your Integration

1. Upload a test image through your API
2. Verify the image URL is returned correctly
3. Check the Cloudinary dashboard to confirm upload
4. Test image display in the admin panel

For more information, refer to the [Cloudinary Documentation](https://cloudinary.com/documentation). 