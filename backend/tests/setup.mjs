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
