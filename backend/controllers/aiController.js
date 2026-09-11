/**
 * The AI a seller can reach: fill the listing, fix the photo.
 *
 * WHO GETS IT
 *   Sellers and admins. Not customers - and that is a cost decision before it
 *   is anything else. Every image here spends a free allowance that belongs to
 *   the whole platform; a public button would be a free image generator with
 *   our quota behind it. The seller is the person whose work this saves, and
 *   the seller is who it is for.
 *
 * THE CAPS
 *   Per seller per day, and for the whole platform per day, because the
 *   scarcest allowance (premium images on Pollen) is platform-wide. Read
 *   BEFORE the call, recorded AFTER a success, so a failed generation costs
 *   nobody anything. The numbers live in one place below.
 *
 * WHICH TIER
 *   Rajat's rule: the best model first, the plentiful one after. A seller's
 *   first premium images of the day come from gpt-image-2 while the platform
 *   still has any; everything after is FLUX.2 on Cloudflare, which is still a
 *   listing-quality result and does not run out.
 *
 * NOTHING IS SAVED TO A PRODUCT HERE
 *   The result goes to a drafts folder on Cloudinary and its URL comes back.
 *   The seller looks at it, and if they want it they add it to the product
 *   through the ordinary form. The form is the human in the loop; this
 *   controller never writes to Product.
 */
const AiUsage = require('../models/AiUsage');
const Category = require('../models/Category');
const cloudinary = require('../utils/cloudinary');
const { sendError } = require('../utils/apiError');
const { runImage, MODES } = require('../utils/ai/imageGen');
const { draftListing } = require('../utils/ai/listing');

const CAPS = {
  textsPerSellerPerDay: 60,
  imagesPerSellerPerDay: 20,
  premiumPerSellerPerDay: 2,
  premiumPerPlatformPerDay: 6,
};

/**
 * Only our own Cloudinary account's URLs are accepted as a photo to work on.
 * Anything else would let a request point the providers - and our fetch - at
 * an arbitrary address, and Cloudinary's resize-on-URL trick only works on
 * Cloudinary anyway.
 */
const ownImage = (url) => cloudinary.isOwnUrl(url);

/** A photo still in the browser: base64, an image, and not absurdly large. */
const MAX_DATA_URL = 5 * 1024 * 1024 * 1.4; // 5 MB of image, base64-inflated
const isImageDataUrl = (s) =>
  typeof s === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(s) && s.length <= MAX_DATA_URL;

const usageFor = async (userId) => {
  const [mine, all] = await Promise.all([AiUsage.read('user', String(userId)), AiUsage.read('global', 'all')]);
  return {
    today: AiUsage.today(),
    mine: { texts: mine.texts, images: mine.images, premiumImages: mine.premiumImages },
    platform: { premiumImages: all.premiumImages, images: all.images },
    caps: CAPS,
    remaining: {
      texts: Math.max(0, CAPS.textsPerSellerPerDay - mine.texts),
      images: Math.max(0, CAPS.imagesPerSellerPerDay - mine.images),
      premiumImages: Math.max(
        0,
        Math.min(CAPS.premiumPerSellerPerDay - mine.premiumImages, CAPS.premiumPerPlatformPerDay - all.premiumImages)
      ),
    },
  };
};

/** GET /api/seller/ai/usage */
const getUsage = async (req, res) => {
  try {
    res.json(await usageFor(req.user._id));
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * POST /api/seller/ai/listing
 * body: { name?, keywords?, price?, categoryId?, imageUrl? }
 */
const writeListing = async (req, res) => {
  try {
    const usage = await usageFor(req.user._id);
    if (usage.remaining.texts === 0) {
      return res.status(429).json({
        message: `You have used today's ${CAPS.textsPerSellerPerDay} AI drafts. It resets at midnight.`,
        usage,
      });
    }

    const { name, keywords, price, categoryId, imageUrl, imageDataUrl } = req.body || {};
    if (imageUrl && !ownImage(imageUrl)) {
      return res.status(400).json({ message: 'That photo is not one of yours.' });
    }
    if (imageDataUrl && !isImageDataUrl(imageDataUrl)) {
      return res.status(400).json({ message: 'That photo could not be read. JPEG, PNG or WebP under 5MB.' });
    }

    // Leaf categories only, by name: a model picks "Earrings", not an ObjectId.
    const browsable = await Category.getBrowsableIds();
    const cats = await Category.find({ _id: { $in: browsable } }).select('name ancestors').lean();
    const parentIds = new Set(cats.flatMap((c) => (c.ancestors || []).map(String)));
    const leaves = cats.filter((c) => !parentIds.has(String(c._id)));
    const chosen = categoryId ? cats.find((c) => String(c._id) === String(categoryId)) : null;

    const result = await draftListing({
      name,
      keywords,
      price,
      categoryName: chosen?.name,
      categoryOptions: leaves.map((c) => c.name),
      imageUrl,
      imageDataUrl,
      brand: req.seller?.businessName,
    });

    if (!result.ok) return res.status(502).json({ message: result.reason });

    const match = leaves.find((c) => c.name === result.draft.categoryName);
    await AiUsage.record(req.user._id, { kind: 'text', provider: 'gemini' });

    res.json({
      draft: { ...result.draft, categoryId: match ? match._id : null },
      warnings: result.warnings,
      usage: await usageFor(req.user._id),
    });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * POST /api/seller/ai/image
 * body: { mode: 'clean'|'lifestyle'|'angle', imageUrl, productName?, tier?: 'premium'|'standard' }
 *
 * `generate` mode is admin-only - a product picture must be of the product
 * that ships, and only banners and category art are ever made from words.
 */
const makeImage = async (req, res) => {
  try {
    const { mode, productName, tier: askedTier, imageDataUrl } = req.body || {};
    let { imageUrl } = req.body || {};
    const isAdmin = req.user?.role === 'admin' || req.capabilities?.admin;

    if (!MODES.includes(mode)) {
      return res.status(400).json({ message: `mode must be one of ${MODES.join(', ')}` });
    }
    if (mode === 'generate' && !isAdmin) {
      return res.status(403).json({ message: 'Product pictures are made from your photo, not from words.' });
    }
    if (mode !== 'generate') {
      /*
       * A photo the seller has picked but not saved yet arrives as a data URL.
       * The providers need a URL (or bytes fetched from one), so it goes to
       * the drafts folder first - and that upload also gives the seller's
       * original a home if they decide to keep both.
       */
      if (!imageUrl && isImageDataUrl(imageDataUrl)) {
        imageUrl = (await cloudinary.uploadImage(imageDataUrl, 'shopmaster-ai-drafts')).url;
      }
      if (!ownImage(imageUrl)) {
        return res.status(400).json({ message: 'Add a photo first, then improve it.' });
      }
    }

    const usage = await usageFor(req.user._id);
    if (usage.remaining.images === 0) {
      return res.status(429).json({
        message: `You have used today's ${CAPS.imagesPerSellerPerDay} AI images. It resets at midnight.`,
        usage,
      });
    }

    /*
     * Premium while it lasts, then standard. A seller may ask for standard
     * outright (it is faster); nobody can ask for premium past the cap.
     */
    const tier = askedTier === 'standard' || usage.remaining.premiumImages === 0 ? 'standard' : 'premium';

    const made = await runImage({
      mode,
      tier,
      imageUrl,
      productName: String(productName || 'product').slice(0, 80),
      prompt: req.body?.prompt,
    });

    // Into a drafts folder, as a data URL - the only shape the upload helper takes.
    const dataUrl = `data:${made.mime};base64,${made.buffer.toString('base64')}`;
    const uploaded = await cloudinary.uploadImage(dataUrl, 'shopmaster-ai-drafts');

    // The premium quota is charged only when the premium MODEL answered - a
    // fallback to Cloudflare inside the premium chain is a standard image.
    const premiumUsed = made.model === 'gpt-image-2';
    await AiUsage.record(req.user._id, { kind: 'image', provider: made.provider, premium: premiumUsed });

    res.json({
      url: uploaded.url,
      publicId: uploaded.publicId,
      provider: made.provider,
      model: made.model,
      tier: premiumUsed ? 'premium' : 'standard',
      usage: await usageFor(req.user._id),
    });
  } catch (error) {
    if (error.attempts) {
      /*
       * The chain's own message names providers and models - right for the
       * log, wrong for a seller. They need to know one of two things: the
       * day's free allowance is gone (come back tomorrow), or the service is
       * having a moment (try again shortly).
       */
      console.error('AI IMAGE CHAIN:', JSON.stringify(error.attempts));
      const allQuota = error.attempts.every((a) => a.kind === 'quota');
      return res.status(error.statusCode || 503).json({
        message: allQuota
          ? "Today's free AI image allowance is used up across the whole platform. It refills overnight - try again tomorrow morning."
          : 'The AI image service is busy right now. Try again in a minute.',
      });
    }
    sendError(res, error);
  }
};

/** GET /api/admin/ai/usage - today's platform picture, and who used what. */
const adminUsage = async (req, res) => {
  try {
    const day = AiUsage.today();
    const [platform, users] = await Promise.all([
      AiUsage.read('global', 'all'),
      AiUsage.find({ scope: 'user', day }).sort({ images: -1 }).limit(50).lean(),
    ]);
    res.json({ today: day, caps: CAPS, platform, users });
  } catch (error) {
    sendError(res, error);
  }
};

module.exports = { getUsage, writeListing, makeImage, adminUsage, CAPS, ownImage };
