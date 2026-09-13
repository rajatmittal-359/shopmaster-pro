const cloudinary = require('./cloudinary');

/**
 * Photos as evidence - the customer's "what arrived", the seller's "what came
 * back", the pack proof. Browser data URLs in, Cloudinary URLs out, in a
 * folder of their own so they are never mistaken for product images and can
 * be purged on a schedule later. At most `max` per call, images only, 5 MB
 * each: a claim is three photos, not a gallery.
 */
const MAX_BYTES = 5 * 1024 * 1024;
const isImageDataUrl = (s) => typeof s === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(s) && s.length <= MAX_BYTES * 1.37;

/**
 * @param {string[]} dataUrls
 * @param {'shopmaster-returns'|'shopmaster-pack-proof'|'shopmaster-disputes'} folder
 * @param {{max?: number}} [opts]
 * @returns {Promise<{ok: true, urls: string[], publicIds: string[]}|{ok: false, message: string}>}
 */
const uploadEvidence = async (dataUrls, folder, { max = 3 } = {}) => {
  const list = (Array.isArray(dataUrls) ? dataUrls : [dataUrls]).filter(Boolean).slice(0, max);
  if (!list.length) return { ok: true, urls: [], publicIds: [] };
  if (list.some((d) => !isImageDataUrl(d))) return { ok: false, message: 'Photos must be JPEG, PNG or WebP under 5 MB each.' };
  const urls = [];
  const publicIds = [];
  for (const d of list) {
    const up = await cloudinary.uploadImage(d, folder);
    urls.push(up.url);
    publicIds.push(up.publicId || up.public_id || null);
  }
  return { ok: true, urls, publicIds };
};

module.exports = { uploadEvidence, isImageDataUrl };
