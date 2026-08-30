/**
 * Gives each catalogue product its own keyword-matched photo.
 *
 * Source: LoremFlickr (Creative Commons Flickr photos, no API key needed).
 * Images are downloaded and re-uploaded to YOUR Cloudinary through the existing
 * uploadImage() helper, so the final URLs are yours - permanent, optimised, and
 * not dependent on LoremFlickr staying up.
 *
 * SAFETY: only touches products still showing the seeded placeholder image.
 * A product that already has a real photo is skipped, so this is safe to
 * re-run and never overwrites a photo you uploaded yourself.
 *
 * Usage:
 *   node addProductImages.js --dry     show keywords per product, upload nothing
 *   node addProductImages.js           fetch + upload + update
 *   node addProductImages.js --revert  put the placeholder back
 *   node addProductImages.js --limit 5 only process the first N (try it out)
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const axios = require('axios');
require('dotenv').config();

const Product = require('./models/Product');
require('./models/Category');
const Category = require('./models/Category');
const { uploadImage } = require('./utils/cloudinary');

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const argVal = (f, d) => {
  const i = ARGS.indexOf(f);
  return i > -1 && ARGS[i + 1] ? ARGS[i + 1] : d;
};

const DRY = has('--dry');
const LIMIT = Number(argVal('--limit', 0)) || 0;
// Target anything still showing the seeded placeholder. More robust than a SKU
// prefix: every product seed.js creates starts on the placeholder whatever its
// SKU, and a product that already has a real photo is skipped automatically.
const PLACEHOLDER_MATCH = /res[.]cloudinary[.]com\/demo\//;
const PLACEHOLDER = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * When LoremFlickr has no photo for a tag combination it serves one fixed
 * "no match" image instead of erroring. It is always exactly this many bytes,
 * which is how we detect it and retry with broader keywords. Without this the
 * whole catalogue silently ends up with the same picture.
 */
/**
 * LoremFlickr answers a query it cannot match with a fixed "no match" picture
 * instead of a 404, so the download succeeds and every unmatched product ends
 * up sharing one image.
 *
 * Matching on an exact byte count (the previous approach) broke silently the
 * moment they re-encoded that picture. Instead, ask for a phrase that can never
 * match anything, hash whatever comes back, and reject that hash from then on.
 */
let noMatchHash = null;

/**
 * Photos already used in this run. Two products can resolve to the same search
 * phrase (two cotton kurtas, say) and LoremFlickr's pool for a narrow tag can
 * be a single picture, so without this the catalogue ends up with visible
 * repeats. A repeat is treated like a miss: try the next phrase instead.
 */
const usedHashes = new Set();

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

const learnNoMatchHash = async () => {
  if (noMatchHash) return noMatchHash;
  const nonsense = 'zzqxwvunmatchablekeyword';
  try {
    const res = await axios.get(
      `https://loremflickr.com/600/600/${nonsense}?lock=1`,
      { responseType: 'arraybuffer', timeout: 25000, validateStatus: (st) => st === 200 }
    );
    noMatchHash = md5(res.data);
    console.log(`no-match image fingerprint: ${noMatchHash.slice(0, 10)} (${res.data.length}B)
`);
  } catch {
    noMatchHash = 'unavailable'; // fall back to the size heuristic below
  }
  return noMatchHash;
};

/** Words that narrow the search to nothing. */
const NOISE = new Set([
  'set','of','with','and','the','for','pro','slim','fit','plated','studded',
  'straight','casual','formal','wireless','true','fast','30ml','2m','25l',
  '10000mah','65w','spo2','4','6','roll','pair','festive','designer','premium',
]);

/** Generic term per leaf category - verified to always return a real photo. */
const CATEGORY_TERM = {
  // Jewellery
  'Rings': 'ring', 'Earrings': 'earring', 'Necklaces & Pendants': 'necklace',
  'Bangles & Bracelets': 'bracelet', 'Anklets & Toe Rings': 'jewellery',
  'Maang Tikka': 'jewellery', 'Mangalsutra & Chains': 'necklace',
  'Nose Pins & Nath': 'jewellery',
  // Fashion
  'Sarees': 'saree', 'Kurtas & Suits': 'kurta', 'Winter Wear': 'jacket',
  'Shirts': 'shirt', 'Ethnic Wear': 'kurta',
  // Footwear and bags
  "Women's Footwear": 'sandal', "Men's Footwear": 'shoes',
  'Handbags & Clutches': 'handbag', 'Backpacks': 'backpack',
  // Electronics and watches
  'Headphones & Audio': 'headphones', 'Chargers & Power Banks': 'charger',
  'Mobile Accessories': 'charger', 'Smart Wearables': 'smartwatch',
  "Women's Watches": 'watch', "Men's Watches": 'watch',
  // Beauty, home, gifts
  'Skincare': 'cosmetics', 'Makeup': 'cosmetics', 'Fragrances': 'perfume',
  'Home Decor': 'decor', 'Kitchen & Serveware': 'kitchen',
  'Gift Sets': 'gift', 'Showpieces': 'decor',
};

/**
 * Candidate search phrases, most specific first. The fetcher walks this list
 * until one returns a real photo, so a narrow phrase is tried before falling
 * back to the category term.
 */
const candidatesFor = (product, categoryName) => {
  const words = product.name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE.has(w));

  const generic = CATEGORY_TERM[categoryName] || 'product';
  const list = [];

  if (words.length >= 2) list.push(`${words[0]},${generic}`);
  if (words.length >= 1) list.push(`${words[0]}`);
  if (words.length >= 2) list.push(`${words[1]},${generic}`);
  list.push(generic);

  return [...new Set(list)];
};

/**
 * Try each candidate phrase until one yields a genuine photo.
 * Returns the data URI plus the phrase that actually worked.
 */
const fetchAsDataUri = async (candidates, lock) => {
  let lastReason = 'no candidates';

  for (const keywords of candidates) {
    const url = `https://loremflickr.com/600/600/${encodeURIComponent(keywords)}?lock=${lock}`;
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 25000,
        maxRedirects: 5,
        validateStatus: (s) => s === 200,
      });

      const contentType = res.headers['content-type'] || '';
      const bytes = res.data.length;

      if (!contentType.startsWith('image/')) {
        lastReason = `not an image (${contentType})`;
      } else if (md5(res.data) === noMatchHash) {
        lastReason = 'no photo for those tags';
      } else if (bytes < 2000) {
        lastReason = `suspiciously small (${bytes}B)`;
      } else if (usedHashes.has(md5(res.data))) {
        lastReason = 'already used by another product';
      } else {
        usedHashes.add(md5(res.data));
        const b64 = Buffer.from(res.data).toString('base64');
        return {
          dataUri: `data:${contentType};base64,${b64}`,
          bytes,
          keywords,
        };
      }
    } catch (err) {
      lastReason = err.message;
    }
    await sleep(250);
  }

  throw new Error(lastReason);
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.name}\n`);

  const filter = { images: { $elemMatch: { $regex: PLACEHOLDER_MATCH } } };

  if (has('--revert')) {
    const n = await Product.countDocuments({});
    console.log(`Reverting ${n} catalogue products to the placeholder image.`);
    if (!DRY) {
      const r = await Product.updateMany({}, { $set: { images: [PLACEHOLDER] } });
      console.log(`Updated: ${r.modifiedCount}`);
    }
    return mongoose.disconnect();
  }

  await learnNoMatchHash();

  let products = await Product.find(filter).populate('category', 'name').lean();
  if (LIMIT) products = products.slice(0, LIMIT);

  console.log(`Catalogue products to process: ${products.length}`);
  console.log('(products with a real photo already are skipped)');

  let done = 0;
  let failed = 0;
  const failures = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const catName = p.category?.name || '';
    const candidates = candidatesFor(p, catName);
    // Derive the lock from the product id, not the loop index. LoremFlickr
    // returns the same photo for the same keyword+lock pair, so an index
    // would hand a different product the same photo on a partial re-run.
    const lock = parseInt(String(p._id).slice(-6), 16) % 100000;

    process.stdout.write(`  ${String(i + 1).padStart(2)}. ${p.name.slice(0, 32).padEnd(33)} `);

    if (DRY) {
      console.log(`try: ${candidates.join(' -> ')}`);
      continue;
    }

    try {
      const { dataUri, bytes, keywords } = await fetchAsDataUri(candidates, lock);
      const uploaded = await uploadImage(dataUri, 'shopmaster-products');
      await Product.updateOne({ _id: p._id }, { $set: { images: [uploaded.url] } });
      console.log(`[${keywords}] ${Math.round(bytes / 1024)}KB -> uploaded`);
      done++;
    } catch (err) {
      console.log(`FAILED (${err.message.slice(0, 40)}) - keeping placeholder`);
      failures.push(p.name);
      failed++;
    }

    await sleep(400); // be polite to the image host
  }

  console.log('');
  if (DRY) {
    console.log('Dry run - nothing fetched or uploaded.');
  } else {
    console.log(`Uploaded: ${done}   failed: ${failed}`);
    if (failures.length) console.log(`  failed: ${failures.join(', ')}`);
    console.log(`\nTo undo: node addProductImages.js --revert`);
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('\nFailed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
