const express = require('express');
const cors = require('cors');

const app = express();

/*
 * Render terminates TLS and forwards the request; without this every visitor
 * looks like the load balancer, so a rate limit would punish everyone for one
 * script. `1` trusts exactly one hop.
 */
app.set('trust proxy', 1);

/*
 * The security headers every framework ships by default and this one never
 * had: no sniffing, no framing, no X-Powered-By, strict transport. A JSON API
 * needs no content-security policy of its own, so helmet's defaults stand.
 */
app.use(require('helmet')());

/**
 * Who may call this API from a browser.
 *
 * Production is an explicit list and nothing else. Development also accepts any
 * localhost port, because Vite silently moves to 5174, 5175 and so on when its
 * usual port is busy - and every request then failed CORS with a bare "Network
 * Error" that says nothing about the real cause.
 *
 * The localhost allowance is guarded by NODE_ENV, so it can never widen the
 * deployed API.
 */
const PRODUCTION_ORIGINS = [
  'https://shopmaster-pro.onrender.com',
  'https://shopmasterpro.in',
  'https://www.shopmasterpro.in',
];

/**
 * Hosts added without a deploy (20 Sep 2026): the new web's staging URL on
 * Vercel/Render before the domain moves. Comma-separated, exact origins
 * (scheme + host), e.g. EXTRA_ORIGINS=https://shopmaster-pro.vercel.app
 */
const extraOrigins = () => String(process.env.EXTRA_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);

const isAllowedOrigin = (origin) => {
  // Same-origin requests, curl and server-to-server calls send no Origin.
  if (!origin) return true;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;
  if (extraOrigins().includes(origin)) return true;

  // Outside production: the laptop itself, and a phone on the same Wi-Fi
  // hitting the laptop by its LAN address (192.168.x.x / 10.x / 172.16-31.x)
  // - how the seller panel is tried on a real phone before a deploy.
  return (
    process.env.NODE_ENV !== 'production' &&
    /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+$/.test(origin)
  );
};

app.use(
  cors({
    origin: (origin, callback) =>
      isAllowedOrigin(origin)
        ? callback(null, true)
        : callback(new Error(`Origin not allowed: ${origin}`)),
    credentials: false,
  })
);

// CRITICAL: the Razorpay webhook signature is an HMAC over the ORIGINAL request
// bytes. It must be registered with a raw body parser BEFORE express.json(),
// otherwise the handler only sees a re-serialized object and can never verify.
// `type: () => true` guarantees a Buffer regardless of the Content-Type sent.
const { handleRazorpayWebhook } = require('./controllers/razorpayController');
app.post(
  '/api/customer/razorpay/webhook',
  express.raw({ type: () => true, limit: '1mb' }),
  handleRazorpayWebhook
);

// Caching policy. Private by default: only the anonymous catalogue opts out,
// because a shared cache must never be allowed to hold a customer's cart or
// order list. See middlewares/cacheControl.js.
const { noStore, publicCatalogue } = require('./middlewares/cacheControl');
app.use(noStore);

// Global body parsing for every other route.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes imports
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const sellerRoutes = require('./routes/sellerRoutes');
const customerRoutes = require('./routes/customerRoutes');
const productRoutes = require('./routes/productRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');

app.get('/', (req, res) => {
  res.json({ message: ' ShopMaster Pro API is running!' });
});

/*
 * Health, for a monitor (15 Sep 2026): the process answering is not the site
 * working - the database is. 200 only when Mongo is connected and answers a
 * ping inside two seconds; 503 otherwise, so UptimeRobot / the Actions check
 * turn red for the failure that actually loses orders. No secrets, no
 * counts - the body is safe to be public.
 */
app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  const started = Date.now();
  try {
    if (mongoose.connection.readyState !== 1) throw new Error(`mongo readyState ${mongoose.connection.readyState}`);
    await Promise.race([mongoose.connection.db.admin().ping(), new Promise((_, rej) => setTimeout(() => rej(new Error('mongo ping timed out')), 2000))]);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, db: 'up', ms: Date.now() - started, uptime: Math.round(process.uptime()) });
  } catch (err) {
    res.set('Cache-Control', 'no-store');
    res.status(503).json({ ok: false, db: 'down', reason: err.message, uptime: Math.round(process.uptime()) });
  }
});

// Mount routes
const { authLimiter, checkoutLimiter, aiLimiter } = require('./middlewares/rateLimits');
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
/*
 * A suspended seller may still ask the assistant (plan 2.24): about the
 * orders they must still deliver, the rule they broke, how to come back.
 * Everything else under /api/seller stays behind checkSellerStatus's wall;
 * this one path is mounted first so it is matched first. The tool set is
 * narrowed inside utils/ai/tools (SUSPENDED_SELLER_TOOLS).
 */
app.post('/api/seller/assist', require('./middlewares/authMiddleware'), require('./middlewares/roleMiddleware')('seller'), async (req, res, next) => {
  try {
    const Seller = require('./models/Seller');
    const seller = await Seller.findOne({ userId: req.user._id }).select('status isApproved suspendedReason suspensionReason').lean();
    if (!seller) return res.status(403).json({ message: 'Seller profile not found' });
    if (seller.status === 'suspended') {
      req.user.sellerStatus = 'suspended';
      req.user.suspendedReason = seller.suspendedReason || seller.suspensionReason || null;
    }
    return require('./controllers/assistController').seller(req, res, next);
  } catch (error) {
    return next(error);
  }
});
app.use('/api/seller', sellerRoutes);
app.use(['/api/customer/checkout-cod', '/api/customer/checkout-online'], checkoutLimiter);
app.use(['/api/seller/ai', '/api/admin/ai', '/api/seller/assist', '/api/admin/assist', '/api/customer/assist', '/api/seller/voice', '/api/admin/voice', '/api/customer/voice', '/api/public/voice'], aiLimiter);
app.use('/api/customer', customerRoutes);
// The bell + push devices, any signed-in role (plan 2.30)
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/public/products', publicCatalogue, productRoutes);

/*
 * A seller's own public page. Same cache policy as the catalogue: it is the
 * same answer for everybody and it changes rarely.
 */
app.use('/api/public/sellers', publicCatalogue, require('./routes/publicSellerRoutes'));
// The seller rulebook, for the agreement page and the consent checkbox - the
// same numbers the code enforces (config/sellerRules.js).
// The coupons a shopper may use right now - Flipkart's "My coupons" page,
// without needing an account to see them. Codes are public by design.
app.get('/api/public/coupons', async (req, res) => {
  try {
    const Coupon = require('./models/Coupon');
    const { shopNamesFor } = require('./utils/shopNames');
    const now = new Date();
    const coupons = await Coupon.find({ isActive: true, $or: [{ validUntil: null }, { validUntil: { $gte: now } }], validFrom: { $lte: now } })
      .select('code description type value maxDiscount minOrderValue validUntil fundedBy sellerId usageLimit usedCount')
      .lean();
    const live = coupons.filter((c) => !c.usageLimit || c.usedCount < c.usageLimit);
    const names = await shopNamesFor(live.map((c) => c.sellerId).filter(Boolean));
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      coupons: live.map((c) => ({
        code: c.code,
        description: c.description,
        type: c.type,
        value: c.value,
        maxDiscount: c.maxDiscount,
        minOrderValue: c.minOrderValue,
        validUntil: c.validUntil,
        shop: c.fundedBy === 'seller' ? names.get(String(c.sellerId)) || null : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Coupons unavailable' });
  }
});

app.get('/api/public/seller-rules', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  const { loadRules, defaults, ...rules } = require('./config/sellerRules');
  res.json(rules);
});
// What the storefront needs to draw itself: identity, links, switches, banner.
app.get('/api/public/settings', require('./controllers/settingsController').publicSettings);
// The search bar's mic before sign-in. Rate-limited above like every AI route.
app.post('/api/public/voice/transcribe', require('./controllers/voiceController').transcribe);
app.use('/api/reviews', reviewRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/pincode', require('./routes/pincodeRoutes'));

/*
 * The product feed Google fetches on a schedule.
 *
 * Public and unauthenticated because Google crawls it anonymously. Everything
 * in it is already on the public product pages - names, prices, images - and
 * nothing about sellers, orders or margins goes near it.
 */
app.get('/api/feed/google.xml', require('./controllers/feedController').googleProductFeed);
app.get('/api/feed/promotions.txt', require('./controllers/feedController').googlePromotionsFeed);

/*
 * The sitemap, live from the catalogue.
 *
 * Served at BOTH paths on purpose. Crawlers and robots.txt expect a sitemap at
 * the site root, while everything else this API serves lives under /api - so
 * the root path is what the frontend rewrites onto, and the /api one is what a
 * human debugging it will guess. Same handler, so they cannot drift.
 */
const { sitemap } = require('./controllers/sitemapController');
app.get('/sitemap.xml', sitemap);
app.get('/api/sitemap.xml', sitemap);

/*
 * Scheduled work, driven from outside this process.
 *
 * node-cron sleeps when the free-tier service sleeps, so the timetable lives in
 * GitHub Actions instead and calls these. Guarded by JOBS_TOKEN - see
 * controllers/jobsController.js for why a missing token means "closed" rather
 * than "open".
 */
app.post('/api/jobs/:name', require('./controllers/jobsController').runJob);

// Courier tracking updates. Named "logistics" on purpose - Shiprocket will not
// register a webhook URL containing "shiprocket", "sr" or "kr".
app.use('/api/logistics', require('./routes/logisticsRoutes'));

// Error middleware
const errorMiddleware = require('./middlewares/errorMiddleware');
app.use(errorMiddleware);

// Simple 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
