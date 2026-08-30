const express = require('express');
const cors = require('cors');

const app = express();

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

const isAllowedOrigin = (origin) => {
  // Same-origin requests, curl and server-to-server calls send no Origin.
  if (!origin) return true;
  if (PRODUCTION_ORIGINS.includes(origin)) return true;

  return (
    process.env.NODE_ENV !== 'production' &&
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
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

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/public/products', publicCatalogue, productRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/inventory', inventoryRoutes);

// Error middleware
const errorMiddleware = require('./middlewares/errorMiddleware');
app.use(errorMiddleware);

// Simple 404
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

module.exports = app;
