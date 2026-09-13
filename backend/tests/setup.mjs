// Deterministic, non-live test environment.
// These are dummy values: no test may touch a real gateway, mailbox or database.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-not-a-real-key';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'test_razorpay_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_FROM_EMAIL = 'no-reply@test.local';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/never-connected-in-tests';
process.env.CLOUDINARY_CLOUD_NAME = 'test';
process.env.CLOUDINARY_API_KEY = 'test';
process.env.CLOUDINARY_API_SECRET = 'test';
// The shipping fallback charges a same-city delivery less, and works that out
// from the pickup pincode. Fixed here so the zone split is deterministic.
process.env.SHIPROCKET_PICKUP_PINCODE = '302019';
/*
 * No AI provider is ever on the line under test. utils/sendEmail.js calls
 * dotenv.config() when imported, and dotenv never overwrites a variable that
 * is already set - so blanking these first is what keeps the real keys in
 * backend/.env out of the suite. (13 Sep 2026: a Groq test went live the
 * moment a real GROQ_API_KEY landed in .env.) Tests that need a key set a
 * dummy one themselves.
 */
process.env.GEMINI_API_KEY = '';
process.env.GROQ_API_KEY = '';
process.env.POLLINATIONS_API_KEY = '';
process.env.CLOUDFLARE_API_TOKEN = '';
process.env.CLOUDFLARE_AI_GATEWAY = ''; // tests mock the direct provider URLs
process.env.HF_TOKEN = '';
process.env.NVIDIA_API_KEY = '';
process.env.SENTRY_DSN = '';
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
process.env.VAPID_SUBJECT = '';

/*
 * The seller-charge ledger and the 30-day cancellation count sit on the cancel
 * and payout paths. Tests written before they existed mock Order and Payout
 * but not these, and an unmocked query to the never-connected database hangs
 * until the test times out. Empty ledger, zero recent cancellations, unless a
 * test says otherwise (sellerRules.test.mjs does).
 */
{
  const SellerCharge = require('../models/SellerCharge');
  const Order = require('../models/Order');
  SellerCharge.find = () => ({ lean: async () => [] });
  SellerCharge.updateMany = async () => ({ modifiedCount: 0 });
  SellerCharge.create = async (doc) => doc;
  Order.countDocuments = async () => 0;
}

/*
 * Atlas Search runs as an aggregate on Product. There is no Atlas here, and
 * an unmocked aggregate would buffer against the never-connected database
 * until the test times out. Fail it fast instead: the code takes the regex
 * road, which is exactly what the catalogue tests were written against.
 */
{
  const Product = require('../models/Product');
  Product.aggregate = async () => {
    throw new Error('no Atlas Search under test');
  };
}

// Nobody is suspended under test unless a test says so; the lookup must not
// wait on a database that never connects.
const hidden = require('../utils/hiddenSellers');
hidden.defaults.find = async () => [];
