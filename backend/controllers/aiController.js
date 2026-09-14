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
const { refineField } = require('../utils/ai/refine');
const { snapshot } = require('../utils/ai/status');
const { byId } = require('../utils/ai/catalog');
const User = require('../models/User');

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

/**
 * WHO IS EXEMPT FROM THE CAPS
 *   The admin, and the platform's own shop (Charming Jewels - the same person).
 *   Rajat's rule: while there are no other sellers, that account uses the AI
 *   freely, even if it leaves nothing for anyone else that day; the caps are
 *   for the sellers who come later. The exempt account can put the caps back
 *   on itself with one toggle (`aiLimitsLikeSeller`) whenever it wants to feel
 *   what a seller feels, or to leave the allowances alone.
 *
 *   Exemption is read from the DATABASE per request - the Seller record and
 *   the User flag - never from the token, same as every other authorisation
 *   decision here.
 */
const isExempt = async (req) => {
  const admin = req.user?.role === 'admin' || req.capabilities?.admin;
  const ownShop = Boolean(req.seller?.isPlatformOwned);
  if (!admin && !ownShop) return false;
  const u = await User.findById(req.user._id).select('aiLimitsLikeSeller').lean();
  return !u?.aiLimitsLikeSeller;
};

const usageFor = async (userId, exempt = false) => {
  const [mine, all] = await Promise.all([AiUsage.read('user', String(userId)), AiUsage.read('global', 'all')]);
  const INF = null; // "no cap" - the interface reads null as unlimited
  return {
    today: AiUsage.today(),
    exempt,
    mine: { texts: mine.texts, images: mine.images, premiumImages: mine.premiumImages },
    platform: { premiumImages: all.premiumImages, images: all.images },
    caps: exempt ? null : CAPS,
    remaining: exempt
      ? { texts: INF, images: INF, premiumImages: INF }
      : {
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
    res.json(await usageFor(req.user._id, await isExempt(req)));
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * GET /api/seller/ai/catalog  (also mounted under /admin)
 *
 * Everything the interface needs to show the picker: every provider, every
 * model, which are available right now, why not, how many more, and when
 * they come back - plus this account's own allowance. One call.
 */
const getCatalog = async (req, res) => {
  try {
    const exempt = await isExempt(req);
    const [state, usage] = await Promise.all([snapshot({ live: true }), usageFor(req.user._id, exempt)]);
    const admin = req.user?.role === 'admin' || req.capabilities?.admin;
    res.json({
      ...state,
      // Sellers do not see the text-to-image models: a product picture is
      // made from the seller's photo, and words-only generation is for
      // banners and category art.
      models: state.models.filter((m) => admin || m.can.includes('edit') || m.can.includes('text')),
      usage,
      canToggleLimits: admin || Boolean(req.seller?.isPlatformOwned),
      limitsLikeSeller: !exempt && (admin || Boolean(req.seller?.isPlatformOwned)),
    });
  } catch (error) {
    sendError(res, error);
  }
};

/** PATCH /api/seller/ai/limits  body: { likeSeller: boolean } - exempt accounts only. */
const setLimits = async (req, res) => {
  try {
    const admin = req.user?.role === 'admin' || req.capabilities?.admin;
    if (!admin && !req.seller?.isPlatformOwned) {
      return res.status(403).json({ message: 'Only an exempt account can change this.' });
    }
    const likeSeller = Boolean(req.body?.likeSeller);
    await User.updateOne({ _id: req.user._id }, { $set: { aiLimitsLikeSeller: likeSeller } });
    res.json({ limitsLikeSeller: likeSeller, usage: await usageFor(req.user._id, !likeSeller) });
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
    const exempt = await isExempt(req);
    const usage = await usageFor(req.user._id, exempt);
    if (!exempt && usage.remaining.texts === 0) {
      return res.status(429).json({
        message: `You have used today's ${CAPS.textsPerSellerPerDay} AI drafts. It resets at midnight.`,
        usage,
      });
    }

    const { name, keywords, price, categoryId, imageUrl, imageDataUrl } = req.body || {};
    // 'auto' (Gemini, nano when Gemini is out) | 'gemini' | 'nano' - the chip on the form.
    const textModel = ['gemini', 'nano'].includes(req.body?.textModel) ? req.body.textModel : 'auto';
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
      textModel,
    });

    if (!result.ok) return res.status(502).json({ message: result.reason });

    const match = leaves.find((c) => c.name === result.draft.categoryName);
    await AiUsage.record(req.user._id, { kind: 'text', provider: result.provider || 'gemini' });

    res.json({
      draft: { ...result.draft, categoryId: match ? match._id : null },
      warnings: result.warnings,
      // Which model wrote it - Gemini normally; Pollinations' nano when
      // Gemini's quota is gone for the day. Provenance, as on every AI image.
      writtenBy: result.provider === 'pollinations' ? `gpt-5.4-nano (Pollinations, Gemini's quota is used up today)` : 'Gemini',
      usage: await usageFor(req.user._id, exempt),
    });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * POST /api/seller/ai/listing-from-speech
 * body: { transcript, categoryId?, imageUrl?, imageDataUrl?, textModel? }
 *
 * "Bol ke listing": the shopkeeper said what the thing is, what it costs and
 * how many there are. The numbers and short labels come out of the sentence
 * (utils/ai/speechListing - fast model + regex); the words go to the same
 * draftListing the photo road uses, as keywords in whatever language they
 * were spoken. One AI draft against the day's cap, like "Write it for me".
 * Everything comes back as a draft the seller sees and changes before saving.
 */
const listingFromSpeech = async (req, res) => {
  try {
    const transcript = String(req.body?.transcript || '').trim().slice(0, 800);
    if (transcript.length < 3) return res.status(400).json({ message: 'Say what the product is, its price and how many you have.' });
    const exempt = await isExempt(req);
    const usage = await usageFor(req.user._id, exempt);
    if (!exempt && usage.remaining.texts === 0) {
      return res.status(429).json({ message: `You have used today's ${CAPS.textsPerSellerPerDay} AI drafts. It resets at midnight.`, usage });
    }
    const { categoryId, imageUrl, imageDataUrl } = req.body || {};
    const textModel = ['gemini', 'nano'].includes(req.body?.textModel) ? req.body.textModel : 'auto';
    if (imageUrl && !ownImage(imageUrl)) return res.status(400).json({ message: 'That photo is not one of yours.' });
    if (imageDataUrl && !isImageDataUrl(imageDataUrl)) return res.status(400).json({ message: 'That photo could not be read. JPEG, PNG or WebP under 5MB.' });

    const { factsFromSpeech } = require('../utils/ai/speechListing');
    const { facts, via } = await factsFromSpeech(transcript);

    const browsable = await Category.getBrowsableIds();
    const cats = await Category.find({ _id: { $in: browsable } }).select('name ancestors').lean();
    const parentIds = new Set(cats.flatMap((x) => (x.ancestors || []).map(String)));
    const leaves = cats.filter((x) => !parentIds.has(String(x._id)));
    const chosen = categoryId ? cats.find((x) => String(x._id) === String(categoryId)) : null;

    // The sentence minus its numbers: "1250 rupaye, 5 piece" are facts for the
    // form, not words for the description (a first draft turned 5 in stock
    // into "Set of 5").
    const words = transcript
      .replace(/(?:₹|rs\.?|rupees?|rupaye|रुपये|रुपए|mrp|एमआरपी|price|daam|dam|दाम|rate|quantity|stock|qty)\s*(?:hai|है|:)?\s*[\d,]+(?:\.\d+)?/gi, ' ')
      .replace(/[\d,]+(?:\.\d+)?\s*(?:₹|rs\.?|rupees?|rupaye|रुपये|रुपए|piece|pieces|pcs|pc|nag|नग|पीस|units?|items?)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const result = await draftListing({
      name: facts.name || undefined,
      keywords: words || transcript,
      price: facts.price || undefined,
      stock: facts.stock || undefined,
      categoryName: chosen?.name,
      categoryOptions: leaves.map((x) => x.name),
      imageUrl,
      imageDataUrl,
      brand: req.seller?.businessName,
      textModel,
    });

    // Even when every prose model is out, the numbers the person said still land in the form.
    const draft = result.ok ? result.draft : { name: facts.name || '', description: '', tags: [], color: '', size: '', gender: '', ageGroup: '', categoryName: '' };
    const match = leaves.find((x) => x.name === draft.categoryName);
    if (result.ok) await AiUsage.record(req.user._id, { kind: 'text', provider: result.provider || 'gemini' });

    res.json({
      heard: transcript,
      facts,
      factsVia: via,
      draft: {
        ...draft,
        categoryId: match ? match._id : null,
        price: facts.price,
        mrp: facts.mrp,
        stock: facts.stock,
        color: draft.color || facts.color || '',
        size: draft.size || facts.size || '',
      },
      warnings: [...(result.ok ? result.warnings : [`The description could not be written right now (${result.reason}). The numbers are filled in - add the words yourself or try "Write it for me" later.`])],
      writtenBy: !result.ok ? null : result.provider === 'pollinations' ? 'gpt-5.4-nano (Pollinations, Gemini\'s quota is used up today)' : 'Gemini',
      usage: await usageFor(req.user._id, exempt),
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
    const { mode, productName, tier: askedTier, imageDataUrl, modelId } = req.body || {};
    let { imageUrl } = req.body || {};
    const isAdmin = req.user?.role === 'admin' || req.capabilities?.admin;
    const exempt = await isExempt(req);

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

    const usage = await usageFor(req.user._id, exempt);
    if (!exempt && usage.remaining.images === 0) {
      return res.status(429).json({
        message: `You have used today's ${CAPS.imagesPerSellerPerDay} AI images. It resets at midnight.`,
        usage,
      });
    }

    /*
     * A chosen model is honoured as chosen. A capped account may pick any
     * model that edits, but a premium one only while it has premium left -
     * so the picker offers them, and the cap decides. An exempt account
     * picks anything.
     */
    let chosen = null;
    if (modelId) {
      chosen = byId[modelId];
      if (!chosen) return res.status(400).json({ message: 'That model is not in the catalogue.' });
      if (!exempt && chosen.quality === 'best' && usage.remaining.premiumImages === 0) {
        return res.status(429).json({ message: `Today's premium images are used up - pick a standard model, or wait for the reset.`, usage });
      }
    }

    // Otherwise: premium while it lasts, then standard. Exempt accounts
    // always get the premium chain.
    const tier =
      askedTier === 'standard' || (!exempt && usage.remaining.premiumImages === 0) ? 'standard' : 'premium';

    const made = await runImage({
      mode,
      tier,
      modelId: chosen?.id,
      imageUrl,
      productName: String(productName || 'product').slice(0, 80),
      prompt: req.body?.prompt,
    });

    // Into a drafts folder, as a data URL - the only shape the upload helper takes.
    const dataUrl = `data:${made.mime};base64,${made.buffer.toString('base64')}`;
    const uploaded = await cloudinary.uploadImage(dataUrl, 'shopmaster-ai-drafts');

    // Remembered, so the product form can offer "from your AI drafts" later.
    // A failure here must not fail the image.
    try {
      const AiDraft = require('../models/AiDraft');
      await AiDraft.create({
        userId: req.user._id,
        url: uploaded.url,
        publicId: uploaded.publicId,
        sourceUrl: imageUrl,
        mode,
        prompt: req.body?.prompt ? String(req.body.prompt).slice(0, 400) : '',
        model: made.model,
        provider: made.provider,
      });
    } catch (err) {
      console.error('AI DRAFT RECORD:', err.message);
    }

    // The premium quota is charged only when a 'best' MODEL answered - a
    // fallback to klein inside the premium chain is a standard image.
    const answered = byId[made.model];
    const premiumUsed = answered?.quality === 'best';
    await AiUsage.record(req.user._id, { kind: 'image', provider: made.provider, premium: premiumUsed });

    res.json({
      url: uploaded.url,
      publicId: uploaded.publicId,
      provider: made.provider,
      providerLabel: answered ? require('../utils/ai/catalog').PROVIDERS[answered.provider].label : made.provider,
      model: made.model,
      modelLabel: made.modelLabel || made.model,
      quality: answered?.quality || 'good',
      tier: premiumUsed ? 'premium' : 'standard',
      attempts: made.attempts,
      usage: await usageFor(req.user._id, exempt),
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

/**
 * POST /api/seller/ai/attach
 * body: { productId, url, position: 'main' | 'gallery' }
 *
 * The missing step. A picture made in the Studio sat in the drafts folder
 * with no road to a product; the seller had to remember it and paste
 * nothing, because there was nothing to paste. This puts a draft onto one of
 * the seller's OWN products - as the main photo or at the end of the gallery
 * - and that is all it does. The ordinary product update does everything
 * else, so the five-photo cap and every validator still apply.
 */
const attachToProduct = async (req, res) => {
  try {
    const { productId, url, position = 'gallery' } = req.body || {};
    if (!ownImage(url)) return res.status(400).json({ message: 'That picture is not one of ours.' });
    if (!['main', 'gallery'].includes(position)) return res.status(400).json({ message: 'position must be main or gallery' });

    const Product = require('../models/Product');
    const isAdmin = req.user?.role === 'admin' || req.capabilities?.admin;
    const filter = { _id: productId, isDeleted: { $ne: true }, ...(isAdmin ? {} : { sellerId: req.user._id }) };
    const product = await Product.findOne(filter);
    if (!product) return res.status(404).json({ message: 'No such product of yours.' });

    const rest = (product.images || []).filter((u) => u !== url);
    const next = position === 'main' ? [url, ...rest] : [...rest, url];
    if (next.length > 5) {
      return res.status(400).json({ message: 'That product already has five photographs. Remove one first.' });
    }
    product.images = next;
    await product.save();

    res.json({ product: { _id: product._id, name: product.name, images: product.images } });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * GET /api/seller/ai/drafts - the pictures this account made recently, so the
 * product form can offer them without the seller keeping a list.
 */
const listDrafts = async (req, res) => {
  try {
    const AiDraft = require('../models/AiDraft');
    const drafts = await AiDraft.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(40).lean();
    res.json({ drafts });
  } catch (error) {
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

/**
 * One field, made better - polish, translate, shorten, add detail. Counts as
 * a text draft against the same daily allowance; the seller sees the model.
 */
const refineText = async (req, res) => {
  try {
    const exempt = await isExempt(req);
    const usage = await usageFor(req.user._id, exempt);
    if (!exempt && usage.remaining.texts === 0) {
      return res.status(429).json({
        message: `You have used today's ${CAPS.textsPerSellerPerDay} AI drafts. It resets at midnight.`,
        usage,
      });
    }
    const { field, action, text, name, categoryName } = req.body || {};
    const textModel = ['gemini', 'nano'].includes(req.body?.textModel) ? req.body.textModel : 'auto';
    const result = await refineField({
      field,
      action,
      text: String(text || '').slice(0, 4000),
      context: { name: String(name || '').slice(0, 200), categoryName: String(categoryName || '').slice(0, 100), textModel },
    });
    if (!result.ok) return res.status(result.status === 429 ? 429 : 400).json({ message: result.reason });
    await AiUsage.record(req.user._id, { kind: 'text', provider: result.provider || 'gemini' });
    res.json({
      text: result.text,
      warnings: result.warnings,
      writtenBy: result.provider === 'pollinations' ? 'gpt-5.4-nano (Pollinations)' : 'Gemini',
      usage: await usageFor(req.user._id, exempt),
    });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * Search words for one product - what a shopper in India would type to find
 * it - and which of them the title and description already carry. The
 * listing-quality panel shows the missing ones as one-tap adds. Counts as a
 * text draft; the seller sees the model.
 */
const suggestKeywords = async (req, res) => {
  try {
    const exempt = await isExempt(req);
    const usage = await usageFor(req.user._id, exempt);
    if (!exempt && usage.remaining.texts === 0) {
      return res.status(429).json({ message: `You have used today's ${CAPS.textsPerSellerPerDay} AI drafts. It resets at midnight.`, usage });
    }
    const { name, description, categoryName, color, imageUrl } = req.body || {};
    if (!name && !imageUrl) return res.status(400).json({ message: 'Give the product a title first.' });
    const textModel = ['gemini', 'nano'].includes(req.body?.textModel) ? req.body.textModel : 'auto';
    const facts = [name && `Title: ${name}`, categoryName && `Category: ${categoryName}`, color && `Colour: ${color}`,
      description && `Description (text): ${String(description).replace(/<[^>]*>/g, ' ').slice(0, 800)}`].filter(Boolean).join('\n');
    // Plan 2.32: the words real people typed come first - Google (Search
    // Console), our own search box, the synonym family - each with its count.
    // The model then fills the gaps and is told what is already known.
    const evidence = await require('../utils/googleReadiness').keywordEvidence({ sellerId: req.user._id, name, categoryName, tags: req.body?.tags, description }).catch(() => ({ words: [], google: false }));
    const known = evidence.words.slice(0, 12).map((w) => `${w.word} (${w.source === 'google' ? 'Google' : w.source === 'shop' ? 'our shoppers' : 'same-thing word'}, ${w.count})`).join(', ');
    const prompt = `You help a small Indian marketplace seller be found on Google and in the shop's own search.

Product facts:
${facts}
${known ? `\nWords real people already typed for products like this (source, count): ${known}\nDo not repeat these; add what is missing around them.` : ''}

Give 8 to 12 search phrases an Indian shopper would actually type for THIS product - a mix of: the plain product type, type + colour, type + occasion or use, type + material or style words that are true from the facts, and one or two Hinglish spellings people use (e.g. "jhumka", "kurti", "payal"). Lowercase. 1-4 words each. No brand names, no prices, no invented materials or purity claims.

Answer with ONE JSON object: {"keywords": ["..."], "titleTip": "one short sentence on how to make the title match how people search, or empty"}`;
    const answer = await require('../utils/gemini').generate(prompt, {
      imageUrl: ownImage(imageUrl) ? imageUrl : undefined,
      responseSchema: { type: 'object', properties: { keywords: { type: 'array', items: { type: 'string' } }, titleTip: { type: 'string' } }, required: ['keywords'] },
      temperature: 0.5,
      textModel,
    });
    if (!answer.ok) return res.status(502).json({ message: answer.reason });
    let parsed;
    try {
      parsed = JSON.parse(answer.text);
    } catch {
      return res.status(502).json({ message: 'The model did not return usable search words. Try again.' });
    }
    const hay = `${name || ''} ${String(description || '').replace(/<[^>]*>/g, ' ')}`.toLowerCase();
    const fromModel = [...new Set((parsed.keywords || []).map((k) => String(k).toLowerCase().trim()).filter((k) => k && k.length <= 40))].slice(0, 12);
    const seen = new Set();
    const keywords = [
      ...evidence.words.slice(0, 12).map((w) => ({ word: w.word, source: w.source, count: w.count, note: w.note })),
      ...fromModel.map((k) => ({ word: k, source: 'ai', count: 0, note: 'Suggested by AI from the facts' })),
    ]
      .filter((k) => (seen.has(k.word) ? false : seen.add(k.word)))
      .slice(0, 20)
      .map((k) => ({ ...k, present: hay.includes(k.word) }));
    await AiUsage.record(req.user._id, { kind: 'text', provider: answer.provider || 'gemini' });
    res.json({
      keywords,
      evidence: { google: evidence.google, fromGoogle: keywords.filter((k) => k.source === 'google').length, fromShop: keywords.filter((k) => k.source === 'shop').length },
      titleTip: String(parsed.titleTip || '').slice(0, 200),
      writtenBy: answer.provider === 'pollinations' ? 'gpt-5.4-nano (Pollinations)' : 'Gemini',
      usage: await usageFor(req.user._id, exempt),
    });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * POST /seller/ai/faqs  { name, description, categoryName, material?, returnMode?, deliveryDays? }
 * Three questions a shopper asks before buying, answered from the facts and
 * the rulebook - never a claim the facts do not support (plan 2.32).
 */
const draftFaqs = async (req, res) => {
  try {
    const exempt = await isExempt(req.user._id);
    const usage = await usageFor(req.user._id, exempt);
    if (!exempt && usage.remaining.texts === 0) {
      return res.status(429).json({ message: `You have used today's ${CAPS.textsPerSellerPerDay} AI drafts. It resets at midnight.`, usage });
    }
    const { name, description, categoryName, material, color, returnMode, size } = req.body || {};
    if (!name) return res.status(400).json({ message: 'Give the product a title first.' });
    const rules = require('../config/sellerRules');
    const returnLine = returnMode === 'none' ? 'This item is not returnable (only a wrong or damaged item is).' : returnMode === 'exchange' ? 'Exchange only, within 7 days of delivery; no refund for change of mind.' : 'Return or exchange within 7 days of delivery, unused with the tag on; damaged or wrong items reported within 48 hours with photos.';
    const prompt = `You write the short Q&A under a product on ShopMaster Pro, an Indian marketplace. Buyers and AI assistants read it.

Product facts:
Title: ${name}
${categoryName ? `Category: ${categoryName}` : ''}
${material ? `Material: ${material}` : ''}
${color ? `Colour: ${color}` : ''}
${size ? `Size: ${size}` : ''}
Description: ${String(description || '').replace(/<[^>]*>/g, ' ').slice(0, 900)}
Return policy for this item: ${returnLine}
Delivery: usually 3-6 days across India; the seller ships within 2 working days.

Write 3 questions a shopper genuinely asks before buying THIS product (care, material truth, size or fit, what is in the box, gifting, delivery/return), each with a plain 1-2 sentence answer in simple Indian English. Only state what the facts support - if the facts do not say the purity, weight or origin, do not invent it; say "as described" or leave that question out. No emoji, no marketing words.

Answer with ONE JSON object: {"faqs":[{"q":"...","a":"..."}]}`;
    const answer = await require('../utils/gemini').generate(prompt, {
      responseSchema: { type: 'object', properties: { faqs: { type: 'array', items: { type: 'object', properties: { q: { type: 'string' }, a: { type: 'string' } }, required: ['q', 'a'] } } }, required: ['faqs'] },
      temperature: 0.4,
      textModel: ['gemini', 'nano'].includes(req.body?.textModel) ? req.body.textModel : 'auto',
    });
    if (!answer.ok) return res.status(502).json({ message: answer.reason });
    let parsed;
    try {
      parsed = JSON.parse(answer.text);
    } catch {
      return res.status(502).json({ message: 'The model did not return usable questions. Try again.' });
    }
    // The gate for facts (15 Sep): a claim the listing never made - purity, hallmark,
    // real stones, origin, warranty - is dropped whole, whichever model wrote it.
    const facts = `${name} ${categoryName || ''} ${material || ''} ${color || ''} ${String(description || '')}`.toLowerCase();
    const CLAIM = /(925|sterling|hallmark|bis|pure (silver|gold)|real (silver|gold|diamond|pearl|stone)|solid gold|22k|18k|14k|certified|lifetime warranty|handmade in [a-z]+|imported)/i;
    const unbacked = (a) => { const m = String(a).match(CLAIM); return m && !facts.includes(m[0].toLowerCase()); };
    const faqs = (parsed.faqs || []).map((x) => ({ q: String(x.q || '').trim().slice(0, 120), a: String(x.a || '').trim().slice(0, 400) })).filter((x) => x.q && x.a && !unbacked(x.a)).slice(0, 4);
    await AiUsage.record(req.user._id, { kind: 'text', provider: answer.provider || 'gemini' });
    void rules;
    res.json({ faqs, writtenBy: answer.provider === 'pollinations' ? 'gpt-5.4-nano (Pollinations)' : 'Gemini', usage: await usageFor(req.user._id, exempt) });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * GET /api/admin/ai/roads - the admin's "AI today": which road answered how
 * often (from AiUsage.byProvider) and which roads are out right now (plan 2.34).
 * Read-only, nothing here calls a model.
 */
const adminRoads = async (req, res) => {
  try {
    const gemini = require('../utils/gemini');
    const { budget } = require('../utils/ai/groq');
    const platform = await AiUsage.read('global', 'all');
    const by = platform.byProvider instanceof Map ? Object.fromEntries(platform.byProvider) : platform.byProvider || {};
    const now = Date.now();
    const groqRows = [...budget.entries()].map(([model, b]) => ({ model, tokensLeft: b.tokens, requestsLeft: b.requests, resetsInSec: Math.max(0, Math.round(((b.tokensResetAt || now) - now) / 1000)) }));
    const flashBlocked = gemini.flashQuotaUntil() > now;
    const roads = [
      { key: 'gemini', name: `Gemini ${gemini.DEFAULT_MODEL}`, has: Boolean(process.env.GEMINI_API_KEY), status: !process.env.GEMINI_API_KEY ? 'off' : flashBlocked ? 'quota' : 'ok', note: flashBlocked ? `Free quota out - back in ${Math.ceil((gemini.flashQuotaUntil() - now) / 60000)} min, ${gemini.LITE_MODEL} answering meanwhile` : 'Best copy. Free tier is small (about 20 requests/day).' },
      { key: 'gemini-lite', name: `Gemini ${gemini.LITE_MODEL}`, has: Boolean(process.env.GEMINI_API_KEY), status: process.env.GEMINI_API_KEY ? 'ok' : 'off', note: 'Same schema and tools, larger free quota, a little plainer.' },
      { key: 'groq', name: 'Groq gpt-oss-120b / compound', has: Boolean(process.env.GROQ_API_KEY), status: !process.env.GROQ_API_KEY ? 'off' : groqRows.some((r) => r.tokensLeft != null && r.tokensLeft < 2500) ? 'quota' : 'ok', note: groqRows.length ? groqRows.map((r) => `${r.model.replace('openai/', '')}: ${r.tokensLeft ?? '?'} tokens left this minute`).join(' · ') : '8,000 tokens per minute per model; resets every minute.' },
      { key: 'cloudflare', name: 'Cloudflare Workers AI (Llama 3.3 70B)', has: Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID), status: process.env.CLOUDFLARE_API_TOKEN ? 'ok' : 'off', note: '10,000 neurons/day, shared with image edits. Balance: Cloudflare → AI → Workers AI.' },
      { key: 'pollinations', name: 'Pollinations gpt-5.4-nano', has: Boolean(process.env.POLLINATIONS_API_KEY), status: process.env.POLLINATIONS_API_KEY ? 'ok' : 'off', note: 'Last road. No daily cap, slower, plainer; reads photos.' },
    ];
    res.set('Cache-Control', 'private, max-age=15');
    res.json({ today: AiUsage.today(), answeredBy: by, roads });
  } catch (error) {
    sendError(res, error);
  }
};

module.exports = { adminRoads, draftFaqs, getUsage, getCatalog, setLimits, writeListing, listingFromSpeech, refineText, suggestKeywords, makeImage, attachToProduct, listDrafts, adminUsage, CAPS, ownImage };
