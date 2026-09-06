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


/**
 * A short product video.
 *
 * WHY VIDEO AT ALL
 *   Jewellery is the case where a photograph is weakest - shine, drape and
 *   scale barely survive a still. Amazon and Flipkart both put a clip in the
 *   first gallery slot for exactly that reason.
 *
 * WHY IT IS CAPPED AT 7MB
 *   The video travels as base64 inside a JSON body, the same way images already
 *   do, and express.json is set to 10mb. Base64 inflates by about a third, so
 *   7MB of video is the honest ceiling - and the API server has 512MB of RAM,
 *   so raising the limit trades a bigger upload for a crashed process.
 *
 *   That is enough for the 15-30 seconds these clips actually want to be. When
 *   it stops being enough the answer is uploading straight from the browser to
 *   Cloudinary and sending us only the URL, which skips our server entirely.
 *
 * Cloudinary transcodes and gives back a poster frame, so the page can show a
 * still until somebody presses play - a video that autoplays on a phone spends
 * a customer's data without asking.
 */
const uploadVideo = async (file, folder = 'shopmaster-videos') => {
  try {
    if (!file || typeof file !== 'string') {
      throw new Error('Invalid video data');
    }
    if (!file.startsWith('data:video/')) {
      throw new Error('That is not a video file. MP4, WebM or MOV.');
    }

    const base64Length = file.split(',')[1]?.length || 0;
    const sizeInMB = (base64Length * 0.75) / (1024 * 1024);

    if (sizeInMB > 7) {
      throw new Error(
        `That video is ${sizeInMB.toFixed(1)}MB. Keep it under 7MB - about 20 seconds is plenty.`
      );
    }

    const result = await cloudinary.uploader.upload(file, {
      folder,
      resource_type: 'video',
      // 720p is more than enough for a product clip on a phone, and it keeps
      // the file small enough not to cost the customer their data.
      transformation: [
        { width: 720, height: 720, crop: 'limit' },
        { quality: 'auto:good' },
      ],
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      // The still Cloudinary generates from the first frame. Shown until the
      // customer presses play.
      poster: result.secure_url.replace(/\.[^.]+$/, '.jpg'),
      duration: result.duration || null,
    };
  } catch (error) {
    throw new Error('Video upload failed: ' + error.message);
  }
};

/** Removing a video needs the resource type spelled out; images are the default. */
const deleteVideo = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
  } catch (error) {
    // Never fail a product edit because an old clip could not be tidied away.
    console.error('Could not delete video', publicId, '-', error.message);
  }
};

module.exports = { uploadImage, deleteImage, uploadVideo, deleteVideo };
