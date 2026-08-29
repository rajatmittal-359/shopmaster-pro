/**
 * Realistic test-data seeder for ShopMaster Pro.
 *
 * Builds a coherent, cross-linked dataset (admin + sellers + customers + orders)
 * designed so every edge case the app has can be reproduced by hand.
 *
 * SAFETY: by default this writes to a SEPARATE database (`<yourDb>_seed`) so it
 * can never mix fixtures into your real data. Use --here to target the database
 * in MONGO_URI instead (it will refuse unless you also pass --i-mean-it).
 *
 *   node seedTestData.js                 seed the _seed database (wipes it first)
 *   node seedTestData.js --tokens        re-print logins/tokens without reseeding
 *   node seedTestData.js --drop          delete the _seed database entirely
 *   node seedTestData.js --here --i-mean-it   seed into MONGO_URI's database
 */
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');
const Seller = require('./models/Seller');
const Category = require('./models/Category');
const Product = require('./models/Product');
const Address = require('./models/Address');
const Cart = require('./models/Cart');
const Wishlist = require('./models/Wishlist');
const Order = require('./models/Order');
const Review = require('./models/Review');
const InventoryLog = require('./models/Inventory');

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);

const PASSWORD = 'Test@1234'; // shared across every seeded account, test-only

// ---------------------------------------------------------------- db target
const resolveUri = () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');
  if (has('--here')) {
    if (!has('--i-mean-it')) {
      throw new Error(
        '--here targets your REAL database. Re-run with --here --i-mean-it if that is truly what you want.'
      );
    }
    return uri;
  }
  // Swap the database name for a dedicated seed database.
  const [base, query = ''] = uri.split('?');
  const trimmed = base.replace(/\/$/, '');
  const idx = trimmed.lastIndexOf('/');
  const dbName = trimmed.slice(idx + 1) || 'shopmaster_pro';
  return `${trimmed.slice(0, idx)}/${dbName}_seed${query ? '?' + query : ''}`;
};

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const token = (user) =>
  jwt.sign({ userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

// ---------------------------------------------------------------- seed data
const CATEGORY_TREE = [
  {
    name: 'Jewellery & Accessories',
    subs: ['Rings', 'Earrings', 'Necklace Sets', 'Bangles & Bracelets'],
  },
  { name: 'Fashion & Apparel', subs: ['Men\'s Clothing', 'Women\'s Clothing'] },
  // Deliberately INACTIVE main category - its whole subtree must stay hidden.
  { name: 'Discontinued Line', subs: ['Old Stock'], isActive: false },
  // Active main whose ONE subcategory is inactive.
  { name: 'Home & Kitchen', subs: [{ name: 'Recalled Cookware', isActive: false }] },
  // Active main with no products at all - should report productCount 0.
  { name: 'Electronics & Gadgets', subs: ['Headphones'] },
];

const seed = async () => {
  const uri = resolveUri();
  await mongoose.connect(uri);
  const dbName = mongoose.connection.name;
  console.log(`Connected to: ${dbName}\n`);

  if (has('--drop')) {
    await mongoose.connection.dropDatabase();
    console.log(`Dropped database "${dbName}".`);
    return mongoose.disconnect();
  }

  if (has('--tokens')) {
    await printLogins();
    return mongoose.disconnect();
  }

  if (dbName.endsWith('_seed')) {
    await mongoose.connection.dropDatabase();
    console.log('Wiped seed database (fresh start).\n');
  } else {
    console.log('WARNING: seeding into a non-seed database. Existing docs are kept.\n');
  }

  // ------------------------------------------------------------ categories
  const cat = {};
  for (const main of CATEGORY_TREE) {
    const parent = await Category.create({
      name: main.name,
      description: `${main.name} products`,
      isActive: main.isActive !== false,
    });
    cat[main.name] = parent;
    for (const sub of main.subs) {
      const subName = typeof sub === 'string' ? sub : sub.name;
      const subActive = typeof sub === 'string' ? true : sub.isActive !== false;
      cat[subName] = await Category.create({
        name: subName,
        description: `${subName}`,
        parentCategory: parent._id,
        isActive: subActive,
      });
    }
  }
  console.log(`categories : ${Object.keys(cat).length}`);

  // ----------------------------------------------------------------- users
  const mkUser = (name, email, role, isVerified = true) =>
    User.create({ name, email, password: PASSWORD, role, isVerified });

  const admin = await mkUser('Platform Admin', 'admin@shopmaster-seed.com', 'admin');

  const sellerApprovedUser = await mkUser('Aarti Sharma', 'seller.approved@shopmaster-seed.com', 'seller');
  const sellerPendingUser = await mkUser('Vikram Rao', 'seller.pending@shopmaster-seed.com', 'seller');
  const sellerSuspendedUser = await mkUser('Nikhil Jain', 'seller.suspended@shopmaster-seed.com', 'seller');
  const sellerSecondUser = await mkUser('Meera Iyer', 'seller.second@shopmaster-seed.com', 'seller');

  const custMain = await mkUser('Rohit Verma', 'customer@shopmaster-seed.com', 'customer');
  const custNew = await mkUser('Sneha Kapoor', 'customer.new@shopmaster-seed.com', 'customer');
  const custUnverified = await mkUser('Imran Sheikh', 'customer.unverified@shopmaster-seed.com', 'customer', false);

  // ------------------------------------------------------------ seller profiles
  const sellerApproved = await Seller.create({
    userId: sellerApprovedUser._id,
    businessName: 'Charming Jewels',
    gstNumber: '08AABCU9603R1ZM',
    bankDetails: { accountNumber: '918273645500', ifscCode: 'HDFC0001234', accountHolderName: 'Aarti Sharma' },
    isApproved: true,
    kycStatus: 'verified',
    status: 'active',
  });
  // Email-verified but NOT approved - the combination that did not exist in prod,
  // so the approval gate can finally be exercised end to end.
  const sellerPending = await Seller.create({
    userId: sellerPendingUser._id,
    businessName: 'Rao Traders',
    isApproved: false,
    kycStatus: 'pending',
    status: 'active',
  });
  const sellerSuspended = await Seller.create({
    userId: sellerSuspendedUser._id,
    businessName: 'Jain Emporium',
    isApproved: true,
    kycStatus: 'verified',
    status: 'suspended',
    suspensionReason: 'Repeated late dispatch',
  });
  // Second active seller - required to exercise tenant isolation.
  const sellerSecond = await Seller.create({
    userId: sellerSecondUser._id,
    businessName: 'Iyer Silks',
    gstNumber: '29AABCU9603R1ZX',
    isApproved: true,
    kycStatus: 'verified',
    status: 'active',
  });
  console.log('users      : 8  (1 admin, 4 sellers, 3 customers)');
  console.log('sellers    : approved / pending / suspended / second-tenant');

  // -------------------------------------------------------------- products
  const mkProduct = (o) =>
    Product.create({
      description: `${o.name} - crafted with care and finished to a high standard.`,
      images: o.images ?? ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
      isActive: o.isActive ?? true,
      lowStockThreshold: o.lowStockThreshold ?? 10,
      weight: o.weight,
      brand: o.brand ?? 'ShopMaster',
      sku: o.sku,
      mrp: o.mrp,
      tags: o.tags ?? [],
      ...o,
    });

  const A = sellerApprovedUser._id;
  const B = sellerSecondUser._id;

  const p = {};
  p.healthy = await mkProduct({ name: 'Rose Gold Pearl Ring', sellerId: A, category: cat['Rings']._id, price: 1600, mrp: 2500, stock: 50, weight: 0.2, sku: 'SMJ-RING-01', tags: ['ring', 'rose gold'] });
  p.atThreshold = await mkProduct({ name: 'Emerald Drop Earrings', sellerId: A, category: cat['Earrings']._id, price: 2200, mrp: 3000, stock: 10, lowStockThreshold: 10, weight: 0.15, sku: 'SMJ-EAR-01' });
  p.belowThreshold = await mkProduct({ name: 'Kundan Bridal Necklace', sellerId: A, category: cat['Necklace Sets']._id, price: 8900, mrp: 12000, stock: 3, lowStockThreshold: 10, weight: 0.6, sku: 'SMJ-NECK-01' });
  p.lastOne = await mkProduct({ name: 'Temple Work Bangle Set', sellerId: A, category: cat['Bangles & Bracelets']._id, price: 3400, stock: 1, weight: 0.4, sku: 'SMJ-BANG-01' });
  p.outOfStock = await mkProduct({ name: 'Antique Choker (Sold Out)', sellerId: A, category: cat['Necklace Sets']._id, price: 7500, stock: 0, weight: 0.5, sku: 'SMJ-NECK-02' });
  p.softDeleted = await mkProduct({ name: 'Discontinued Anklet', sellerId: A, category: cat['Rings']._id, price: 900, stock: 12, isActive: false, sku: 'SMJ-ANK-01' });
  p.noWeight = await mkProduct({ name: 'Silver Toe Ring (no weight set)', sellerId: A, category: cat['Rings']._id, price: 450, stock: 20, sku: 'SMJ-TOE-01' });
  p.noImages = await mkProduct({ name: 'Plain Band Ring (no images)', sellerId: A, category: cat['Rings']._id, price: 700, stock: 15, images: [], sku: 'SMJ-BAND-01' });
  // Second seller's products - must never appear in seller A's inventory logs.
  p.otherSeller = await mkProduct({ name: 'Banarasi Silk Saree', sellerId: B, category: cat["Women's Clothing"]._id, price: 5400, mrp: 7000, stock: 8, weight: 0.9, sku: 'IYR-SAR-01' });
  p.otherSeller2 = await mkProduct({ name: 'Cotton Kurta Set', sellerId: B, category: cat["Men's Clothing"]._id, price: 1800, stock: 25, weight: 0.5, sku: 'IYR-KUR-01' });
  // Under an INACTIVE main category - must stay hidden from the shop.
  p.hiddenByCategory = await mkProduct({ name: 'Legacy Item (inactive category)', sellerId: A, category: cat['Old Stock']._id, price: 1200, stock: 5, weight: 0.3, sku: 'SMJ-OLD-01' });
  console.log(`products   : ${Object.keys(p).length}`);

  // ------------------------------------------------------------- addresses
  const addrMain = await Address.create({ userId: custMain._id, label: 'Home', phoneNumber: '9876543210', street: '12 Katewa Nagar, Devi Nagar', city: 'Jaipur', state: 'Rajasthan', zipCode: '302019', isDefault: true });
  const addrWork = await Address.create({ userId: custMain._id, label: 'Office', phoneNumber: '9876543211', street: '4th Floor, Malviya Industrial Area', city: 'Jaipur', state: 'Rajasthan', zipCode: '302017' });
  // Belongs to a DIFFERENT customer - use this id to test the address IDOR boundary.
  const addrOther = await Address.create({ userId: custNew._id, label: 'Home', phoneNumber: '9812345678', street: '88 Koramangala 5th Block', city: 'Bengaluru', state: 'Karnataka', zipCode: '560095', isDefault: true });
  console.log('addresses  : 3  (2 for main customer, 1 for another customer)');

  // ------------------------------------------------------- cart & wishlist
  await Cart.create({
    userId: custMain._id,
    items: [
      { productId: p.healthy._id, quantity: 2, price: p.healthy.price },
      { productId: p.lastOne._id, quantity: 1, price: p.lastOne.price }, // stock is exactly 1
    ],
    totalAmount: p.healthy.price * 2 + p.lastOne.price,
  });
  await Cart.create({ userId: custNew._id, items: [], totalAmount: 0 });
  await Wishlist.create({
    userId: custMain._id,
    items: [{ productId: p.belowThreshold._id }, { productId: p.otherSeller._id }],
  });
  console.log('carts      : 2  (one loaded, one empty)');

  // ---------------------------------------------------------------- orders
  const mkOrder = (o) =>
    Order.create({
      customerId: custMain._id,
      shippingAddressId: addrMain._id,
      shippingProvider: 'shiprocket',
      shippingCourierName: 'DTDC Surface',
      shippingCharges: o.shippingCharges ?? 100,
      ...o,
    });

  const item = (prod, qty = 1, status = 'active') => ({
    productId: prod._id,
    sellerId: prod.sellerId,
    name: prod.name,
    quantity: qty,
    price: prod.price,
    status,
  });

  const orders = {};
  orders.codPending = await mkOrder({ items: [item(p.healthy)], totalAmount: p.healthy.price + 100, status: 'pending', paymentMethod: 'cod', paymentStatus: 'pending', createdAt: daysAgo(1) });
  orders.codDelivered = await mkOrder({ items: [item(p.atThreshold)], totalAmount: p.atThreshold.price + 100, status: 'delivered', paymentMethod: 'cod', paymentStatus: 'paid', createdAt: daysAgo(20) });
  orders.prepaidAbandoned = await mkOrder({ items: [item(p.belowThreshold)], totalAmount: p.belowThreshold.price + 100, status: 'pending', paymentMethod: 'razorpay', paymentStatus: 'pending', razorpayOrderId: 'order_SEEDABANDONED01', createdAt: daysAgo(5) });
  orders.prepaidPaid = await mkOrder({ items: [item(p.healthy, 2)], totalAmount: p.healthy.price * 2 + 100, status: 'processing', paymentMethod: 'razorpay', paymentStatus: 'paid', razorpayOrderId: 'order_SEEDPAID0001', razorpayPaymentId: 'pay_SEEDPAID0001', razorpaySignature: 'seed-signature', createdAt: daysAgo(3) });
  orders.shipped = await mkOrder({ items: [item(p.noWeight, 3)], totalAmount: p.noWeight.price * 3 + 100, status: 'shipped', paymentMethod: 'razorpay', paymentStatus: 'paid', razorpayOrderId: 'order_SEEDSHIP0001', razorpayPaymentId: 'pay_SEEDSHIP0001', trackingInfo: { courierName: 'Delhivery', trackingNumber: 'DL77219934', shippedDate: daysAgo(2) }, createdAt: daysAgo(6) });
  orders.refunded = await mkOrder({ items: [item(p.noImages, 1, 'cancelled')], totalAmount: p.noImages.price + 100, status: 'cancelled', paymentMethod: 'razorpay', paymentStatus: 'refunded', razorpayOrderId: 'order_SEEDREFUND01', razorpayPaymentId: 'pay_SEEDREFUND01', refundId: 'rfnd_SEED0001', refundStatus: 'processing', refundAmount: p.noImages.price + 100, refundedAt: daysAgo(4), createdAt: daysAgo(10) });
  orders.returned = await mkOrder({ items: [item(p.lastOne)], totalAmount: p.lastOne.price + 100, status: 'returned', paymentMethod: 'cod', paymentStatus: 'paid', createdAt: daysAgo(30) });
  // Multi-seller order: exercises per-seller filtering and the shared-status limitation.
  orders.multiSeller = await mkOrder({ items: [item(p.healthy), item(p.otherSeller)], totalAmount: p.healthy.price + p.otherSeller.price + 100, status: 'pending', paymentMethod: 'cod', paymentStatus: 'pending', createdAt: daysAgo(1) });
  // Partially cancelled: one line cancelled, one still active.
  orders.partiallyCancelled = await mkOrder({ items: [item(p.healthy, 1, 'cancelled'), item(p.noWeight, 2)], totalAmount: p.noWeight.price * 2 + 100, status: 'processing', paymentMethod: 'cod', paymentStatus: 'pending', createdAt: daysAgo(7) });
  // Another customer's order - must be invisible to the main customer.
  orders.otherCustomer = await Order.create({ customerId: custNew._id, shippingAddressId: addrOther._id, items: [item(p.otherSeller2)], totalAmount: p.otherSeller2.price + 100, status: 'delivered', paymentMethod: 'cod', paymentStatus: 'paid', shippingCharges: 100, createdAt: daysAgo(15) });
  console.log(`orders     : ${Object.keys(orders).length}  (every lifecycle state)`);

  // -------------------------------------------------------------- reviews
  // Verified-buyer review: the product was in a delivered order for this customer.
  await Review.create({ productId: p.atThreshold._id, userId: custMain._id, orderId: orders.codDelivered._id, rating: 5, title: 'Beautiful earrings', comment: 'Exactly as pictured, arrived quickly.' });
  await Review.create({ productId: p.lastOne._id, userId: custMain._id, orderId: orders.returned._id, rating: 3, title: 'Nice but returned', comment: 'Sizing did not work for me.' });
  await Product.findByIdAndUpdate(p.atThreshold._id, { avgRating: 5, totalReviews: 1 });
  await Product.findByIdAndUpdate(p.lastOne._id, { avgRating: 3, totalReviews: 1 });
  console.log('reviews    : 2  (both verified buyers)');

  // -------------------------------------------------------- inventory logs
  const log = (prod, type, qty, before, after, extra = {}) =>
    InventoryLog.create({ productId: prod._id, type, quantity: qty, stockBefore: before, stockAfter: after, performedBy: custMain._id, ...extra });

  await log(p.atThreshold, 'sale', -1, 11, 10, { orderId: orders.codDelivered._id });
  await log(p.healthy, 'sale', -2, 52, 50, { orderId: orders.prepaidPaid._id });
  await log(p.noImages, 'return', 1, 14, 15, { orderId: orders.refunded._id, reason: 'Order cancelled' });
  await log(p.belowThreshold, 'adjustment', -7, 10, 3, { performedBy: sellerApprovedUser._id, reason: 'Damaged units removed' });
  await log(p.otherSeller, 'adjustment', 3, 5, 8, { performedBy: sellerSecondUser._id, reason: 'Restocked from supplier' });
  console.log('inv. logs  : 5  (sale / return / adjustment, across two sellers)');

  console.log('');
  await printLogins();
  await mongoose.disconnect();
};

// ---------------------------------------------------------------- summary
const printLogins = async () => {
  const users = await User.find({ email: /@shopmaster-seed\.com$/ }).sort({ role: 1 }).lean();
  if (!users.length) {
    console.log('No seeded users found in this database.');
    return;
  }

  console.log('='.repeat(78));
  console.log(`LOGINS  -  password for every account: ${PASSWORD}`);
  console.log('='.repeat(78));
  for (const u of users) {
    const note =
      u.isVerified === false ? '  (email NOT verified - login blocked by design)' : '';
    console.log(`  ${u.role.padEnd(9)} ${u.email.padEnd(42)} ${u.name}${note}`);
  }

  console.log('');
  console.log('='.repeat(78));
  console.log('BEARER TOKENS (30 days) - paste into Authorization: Bearer <token>');
  console.log('='.repeat(78));
  for (const u of users.filter((x) => x.isVerified !== false)) {
    console.log(`\n# ${u.role} - ${u.email}`);
    console.log(token(u));
  }
  console.log('');
};

seed().catch(async (err) => {
  console.error('\nSeed failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
