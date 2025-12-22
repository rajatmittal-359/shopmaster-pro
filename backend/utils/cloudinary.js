const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload image to Cloudinary
// Upload image to Cloudinary
const uploadImage = async (file, folder = 'shopmaster-products') => {
  try {
    // ✅ Validate format
    if (!file || typeof file !== 'string') {
      console.error('UPLOAD IMAGE INVALID TYPE:', typeof file, file);
      throw new Error('Invalid image data');
    }

    if (!file.startsWith('data:image/')) {
      console.error('UPLOAD IMAGE INVALID FORMAT SAMPLE:', file.slice(0, 50));
      throw new Error('Invalid image format. Only images allowed (JPEG, PNG, WebP)');
    }

    // ✅ Validate size (max 5MB)
    const base64Length = file.split(',')[1]?.length || 0;
    const sizeInMB = (base64Length * 0.75) / (1024 * 1024);
    
    if (sizeInMB > 5) {
      throw new Error(`Image size ${sizeInMB.toFixed(2)}MB exceeds 5MB limit`);
    }

    // ✅ Upload with optimization
    const result = await cloudinary.uploader.upload(file, {
      folder: folder,
      resource_type: 'image', // Changed from 'auto' to 'image'
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });
    
    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    throw new Error('Image upload failed: ' + error.message);
  }
};


// Delete image from Cloudinary
const deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    throw new Error('Image deletion failed: ' + error.message);
  }
};

module.exports = { uploadImage, deleteImage };
