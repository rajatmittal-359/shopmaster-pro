/**
 * Builds the ShopMaster Pro database from nothing.
 *
 * Single source of truth for the platform's starting state: the category tree,
 * the accounts, the seller profiles, the catalogue and a realistic trading
 * history. It replaces the pile of one-off scripts that grew during development.
 *
 * THE BUSINESS MODEL, IN DATA
 *   Charming Jewels is the platform's OWN jewellery shop, so its commission is
 *   0%. Every other seller is a marketplace tenant paying the platform rate
 *   (utils/commission.js). Seeded orders carry a real commission snapshot, so
 *   the admin dashboard shows genuine platform revenue rather than zeroes.
 *
 * SECURITY
 *   No password is written in this file. Each account's password comes from the
 *   environment, and if it is not set a strong one is generated and printed
 *   ONCE. Nothing secret is ever committed.
 *
 *     SEED_ADMIN_PASSWORD   SEED_SELLER_PASSWORD   SEED_CUSTOMER_PASSWORD
 *
 *   Every other account (partner sellers, demo customers) shares one generated
 *   password, printed with them, so testing stays practical.
 *
 * USAGE
 *   node seed.js --dry       show the plan, write nothing
 *   node seed.js --reset     wipe the database and rebuild
 *   node seed.js --minimal   only the three real accounts + the jewellery shop
 *   node seed.js --tokens    reprint logins and API tokens, no writes
 */
const crypto = require('crypto');
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
const { applyCommission, DEFAULT_COMMISSION_RATE } = require('./utils/commission');

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const DRY = has('--dry');
const MINIMAL = has('--minimal');

/** Shown until a real photo is uploaded. Products are never left with none. */
const PLACEHOLDER_IMAGE =
  'https://res.cloudinary.com/demo/image/upload/w_800,h_800,c_fill/sample.jpg';

// --------------------------------------------------------------- accounts
/**
 * The three accounts the owner actually controls. Each uses a real inbox,
 * because order confirmations and OTPs are delivered to them.
 */
const ACCOUNTS = {
  admin: {
    name: 'Rajat Mittal',
    email: 'rajatmittal359@gmail.com',
    role: 'admin',
    envKey: 'SEED_ADMIN_PASSWORD',
  },
  seller: {
    name: 'Rajat Mittal',
    email: 'rajatmittal6908@gmail.com',
    role: 'seller',
    envKey: 'SEED_SELLER_PASSWORD',
  },
  customer: {
    name: 'Abha Mittal',
    email: 'mittalabha70@gmail.com',
    role: 'customer',
    envKey: 'SEED_CUSTOMER_PASSWORD',
  },
};

/** The platform's own jewellery business - the reason the site exists. */
const HOUSE_SELLER = {
  key: 'CJ',
  businessName: 'Charming Jewels',
  commissionRate: 0, // own store: the platform does not charge itself
  gstNumber: '08AABCU9603R1ZM',
  isApproved: true,
  kycStatus: 'verified',
  status: 'active',
};

/**
 * Marketplace tenants. These are what make the platform a marketplace rather
 * than a single shop, and what the commission model is actually for.
 *
 * They deliberately differ from one another so every state the seller side can
 * be in is represented: approved and trading, awaiting approval, and suspended.
 */
const PARTNER_SELLERS = [
  {
    key: 'IS',
    name: 'Meera Iyer',
    email: 'meera.iyer@shopmasterpro.in',
    businessName: 'Iyer Silks',
    gstNumber: '29AABCU9603R1ZX',
    commissionRate: DEFAULT_COMMISSION_RATE,
    isApproved: true,
    kycStatus: 'verified',
    status: 'active',
  },
  {
    key: 'NV',
    name: 'Karan Bhatia',
    email: 'karan.bhatia@shopmasterpro.in',
    businessName: 'Nova Electronics',
    gstNumber: '27AABCU9603R1ZP',
    // Negotiated rate: high-volume, low-margin category.
    commissionRate: 6,
    isApproved: true,
    kycStatus: 'verified',
    status: 'active',
  },
  {
    key: 'BH',
    name: 'Sneha Kapoor',
    email: 'sneha.kapoor@shopmasterpro.in',
    businessName: 'Bloom Home & Beauty',
    commissionRate: DEFAULT_COMMISSION_RATE,
    isApproved: true,
    kycStatus: 'verified',
    status: 'active',
  },
  {
    key: 'RT',
    name: 'Vikram Rao',
    email: 'vikram.rao@shopmasterpro.in',
    businessName: 'Rao Traders',
    commissionRate: DEFAULT_COMMISSION_RATE,
    // Signed up but not yet let in - exercises the approval gate.
    isApproved: false,
    kycStatus: 'pending',
    status: 'active',
    noProducts: true,
  },
];

/** Buyers other than the owner, so orders are not all from one person. */
const DEMO_CUSTOMERS = [
  {
    name: 'Priya Nair',
    email: 'priya.nair@shopmasterpro.in',
    address: {
      label: 'Home',
      phoneNumber: '9876501234',
      street: '221 Indiranagar 12th Main',
      city: 'Bengaluru',
      state: 'Karnataka',
      zipCode: '560038',
    },
  },
  {
    name: 'Arjun Desai',
    email: 'arjun.desai@shopmasterpro.in',
    address: {
      label: 'Home',
      phoneNumber: '9823004455',
      street: 'B-14 Koregaon Park Lane 5',
      city: 'Pune',
      state: 'Maharashtra',
      zipCode: '411001',
    },
  },
  {
    name: 'Fatima Sheikh',
    email: 'fatima.sheikh@shopmasterpro.in',
    address: {
      label: 'Office',
      phoneNumber: '9812007788',
      street: '7th Floor, Salt Lake Sector V',
      city: 'Kolkata',
      state: 'West Bengal',
      zipCode: '700091',
    },
  },
];

/** The owner's own delivery address, used for their test purchases. */
const OWNER_ADDRESS = {
  label: 'Home',
  phoneNumber: '9829012345',
  street: '12 Katewa Nagar, Devi Nagar',
  city: 'Jaipur',
  state: 'Rajasthan',
  zipCode: '302019',
  isDefault: true,
};

// ------------------------------------------------------------- categories
/**
 * Two levels: broad departments customers recognise, each holding the specific
 * buckets products actually sit in. Products attach only to a LEAF - a parent
 * shows its whole subtree through the ancestors field.
 *
 * Jewellery is deliberately the widest branch: it is the platform's own
 * business and the branch that has to rank in search.
 */
const CATEGORY_TREE = [
  ['Jewellery', [
    'Rings',
    'Earrings',
    'Necklaces & Pendants',
    'Bangles & Bracelets',
    'Anklets & Toe Rings',
    'Maang Tikka',
    'Mangalsutra & Chains',
    'Nose Pins & Nath',
  ]],
  ["Women's Fashion", ['Sarees', 'Kurtas & Suits', 'Winter Wear']],
  ["Men's Fashion", ['Shirts', 'Ethnic Wear']],
  ['Footwear', ["Women's Footwear", "Men's Footwear"]],
  ['Bags & Luggage', ['Handbags & Clutches', 'Backpacks']],
  ['Electronics', ['Headphones & Audio', 'Chargers & Power Banks', 'Mobile Accessories', 'Smart Wearables']],
  ['Watches', ["Women's Watches", "Men's Watches"]],
  ['Beauty & Personal Care', ['Skincare', 'Makeup', 'Fragrances']],
  ['Home & Kitchen', ['Home Decor', 'Kitchen & Serveware', 'Showpieces']],
  ['Gifts', ['Gift Sets']],
];

// -------------------------------------------------------------- catalogue
/**
 * [sellerKey, name, leafCategory, price, mrp, stock, weightKg, tags]
 *
 * Weights are real shipping weights. Rings and studs are grams, not the 0.1 kg
 * the old schema forced, which is what made courier quotes too high.
 */
const CATALOGUE = [
  // ---- Charming Jewels: the platform's own stock, 0% commission ----
  ['CJ', 'Rose Gold Pearl Floral Ring', 'Rings', 1600, 2500, 40, 0.006, ['ring', 'rose gold', 'pearl']],
  ['CJ', 'Emerald Solitaire Cocktail Ring', 'Rings', 2450, 3200, 12, 0.008, ['ring', 'emerald', 'party wear']],
  ['CJ', 'Oxidised Silver Statement Ring', 'Rings', 680, 950, 25, 0.007, ['ring', 'oxidised', 'silver']],
  ['CJ', 'Kundan Chandbali Earrings', 'Earrings', 1850, 2800, 18, 0.02, ['earrings', 'kundan', 'bridal']],
  ['CJ', 'Pearl Drop Jhumka', 'Earrings', 1200, 1799, 30, 0.018, ['earrings', 'jhumka', 'pearl']],
  ['CJ', 'Emerald Green Stone Studs', 'Earrings', 750, 1100, 8, 0.005, ['earrings', 'studs', 'emerald']],
  ['CJ', 'Royal Kundan Bridal Choker Set', 'Necklaces & Pendants', 8900, 12500, 5, 0.18, ['necklace', 'bridal', 'kundan']],
  ['CJ', 'Traditional Ruby Long Haar', 'Necklaces & Pendants', 4600, 6200, 9, 0.14, ['necklace', 'ruby', 'traditional']],
  ['CJ', 'White Pearl Layered Necklace', 'Necklaces & Pendants', 2300, 3400, 14, 0.09, ['necklace', 'pearl', 'layered']],
  ['CJ', 'Antique Gold Temple Necklace', 'Necklaces & Pendants', 6800, 9000, 3, 0.16, ['necklace', 'temple', 'antique']],
  ['CJ', 'Meenakari Bangle Set of 4', 'Bangles & Bracelets', 1450, 2100, 22, 0.06, ['bangles', 'meenakari']],
  ['CJ', 'Rose Gold Chain Bracelet', 'Bangles & Bracelets', 980, 1400, 16, 0.015, ['bracelet', 'rose gold']],
  ['CJ', 'Oxidised Silver Kada', 'Bangles & Bracelets', 1250, 1800, 7, 0.045, ['kada', 'oxidised']],
  ['CJ', 'Silver Ghungroo Payal Pair', 'Anklets & Toe Rings', 890, 1300, 20, 0.035, ['anklet', 'payal', 'silver']],
  ['CJ', 'Pearl Maang Tikka', 'Maang Tikka', 1100, 1600, 11, 0.012, ['maang tikka', 'bridal']],
  ['CJ', 'Gold Plated Mangalsutra', 'Mangalsutra & Chains', 2100, 3000, 9, 0.022, ['mangalsutra', 'gold plated']],
  ['CJ', 'Stone Studded Nose Pin', 'Nose Pins & Nath', 450, 700, 26, 0.002, ['nose pin', 'stone']],

  // ---- Iyer Silks: apparel, footwear and bags ----
  ['IS', 'Banarasi Silk Saree with Blouse', 'Sarees', 5400, 7500, 8, 0.9, ['saree', 'banarasi', 'silk']],
  ['IS', 'Kanjivaram Bridal Saree', 'Sarees', 12500, 17000, 3, 1.1, ['saree', 'kanjivaram', 'bridal']],
  ['IS', 'Chikankari Anarkali Kurta', 'Kurtas & Suits', 2200, 3200, 15, 0.4, ['kurta', 'chikankari']],
  ['IS', 'Cotton Straight Kurta Set', 'Kurtas & Suits', 1350, 1999, 26, 0.45, ['kurta', 'cotton']],
  ['IS', 'Rayon Palazzo Set', 'Kurtas & Suits', 1150, 1650, 19, 0.4, ['palazzo', 'rayon']],
  ['IS', 'Handloom Woollen Shawl', 'Winter Wear', 1650, 2400, 12, 0.5, ['shawl', 'winter', 'handloom']],
  ['IS', 'Quilted Puffer Jacket', 'Winter Wear', 2400, 3500, 6, 0.8, ['jacket', 'winter']],
  ['IS', 'Slim Fit Formal Shirt', 'Shirts', 1099, 1599, 34, 0.3, ['shirt', 'formal']],
  ['IS', 'Cotton Kurta Pyjama Set', 'Ethnic Wear', 1800, 2600, 21, 0.55, ['kurta', 'ethnic']],
  ['IS', 'Embroidered Juttis', "Women's Footwear", 1250, 1800, 17, 0.45, ['juttis', 'ethnic']],
  ['IS', 'Block Heel Sandals', "Women's Footwear", 1450, 2100, 9, 0.5, ['sandals', 'heels']],
  ['IS', 'Leather Formal Derby', "Men's Footwear", 2650, 3800, 11, 0.85, ['shoes', 'leather', 'formal']],
  ['IS', 'Canvas Casual Sneakers', "Men's Footwear", 1499, 2200, 28, 0.7, ['sneakers', 'casual']],
  ['IS', 'Embroidered Potli Clutch', 'Handbags & Clutches', 950, 1400, 23, 0.2, ['clutch', 'potli', 'ethnic']],
  ['IS', 'Vegan Leather Tote Bag', 'Handbags & Clutches', 1850, 2700, 13, 0.6, ['tote', 'handbag']],
  ['IS', 'Laptop Backpack 25L', 'Backpacks', 1699, 2499, 18, 0.75, ['backpack', 'laptop']],

  // ---- Nova Electronics: negotiated 6% ----
  ['NV', 'Wireless Over-Ear Headphones', 'Headphones & Audio', 2999, 4499, 24, 0.35, ['headphones', 'wireless']],
  ['NV', 'True Wireless Earbuds Pro', 'Headphones & Audio', 1999, 3499, 41, 0.06, ['earbuds', 'tws']],
  ['NV', '65W GaN Fast Charger', 'Chargers & Power Banks', 1799, 2499, 32, 0.15, ['charger', 'gan']],
  ['NV', '10000mAh Slim Power Bank', 'Chargers & Power Banks', 1499, 2199, 15, 0.25, ['power bank']],
  ['NV', 'Braided USB-C Cable 2m', 'Mobile Accessories', 399, 699, 60, 0.05, ['cable', 'usb-c']],
  ['NV', 'Fitness Band with SpO2', 'Smart Wearables', 1899, 2999, 20, 0.04, ['fitness band', 'wearable']],
  ['NV', 'Rose Gold Analog Watch', "Women's Watches", 2299, 3400, 14, 0.08, ['watch', 'analog']],
  ['NV', 'Leather Strap Chronograph', "Men's Watches", 3499, 4999, 8, 0.12, ['watch', 'chronograph']],

  // ---- Bloom Home & Beauty ----
  ['BH', 'Vitamin C Face Serum 30ml', 'Skincare', 649, 999, 48, 0.08, ['serum', 'vitamin c']],
  ['BH', 'Ubtan Gel Face Wash', 'Skincare', 299, 449, 62, 0.12, ['face wash', 'ubtan']],
  ['BH', 'Matte Liquid Lipstick', 'Makeup', 449, 699, 37, 0.03, ['lipstick', 'matte']],
  ['BH', 'Oudh Attar Roll-On', 'Fragrances', 599, 899, 4, 0.05, ['attar', 'fragrance']],
  ['BH', 'Brass Diya Set of 6', 'Home Decor', 749, 1100, 35, 0.5, ['diya', 'brass', 'festive']],
  ['BH', 'Macrame Wall Hanging', 'Home Decor', 1150, 1700, 14, 0.3, ['wall decor', 'macrame']],
  ['BH', 'Copper Serving Tray', 'Kitchen & Serveware', 1299, 1900, 10, 0.9, ['tray', 'copper']],
  ['BH', 'Marble Ganesha Showpiece', 'Showpieces', 1450, 2100, 7, 1.2, ['showpiece', 'marble']],
  ['BH', 'Festive Hamper Gift Box', 'Gift Sets', 1999, 2900, 12, 1.0, ['gift', 'hamper', 'festive']],
];

// ---------------------------------------------------------------- helpers
/** A password strong enough to be a real credential, if none was supplied. */
const strongPassword = () => crypto.randomBytes(12).toString('base64url');

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const initials = (businessName) =>
  businessName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);

const skuFor = (businessName, name, i) =>
  `${initials(businessName)}-${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6)}-${String(i + 1).padStart(3, '0')}`;

const token = (user) =>
  jwt.sign({ userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

const line = (c) => console.log((c || '-').repeat(74));

// ------------------------------------------------------------------- run
const run = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');

  await mongoose.connect(process.env.MONGO_URI);
  const dbName = mongoose.connection.name;

  const mode = DRY ? 'DRY RUN (nothing written)' : has('--reset') ? 'RESET then build' : 'build';
  console.log(`Database : ${dbName}`);
  console.log(`Mode     : ${mode}`);
  console.log(`Scope    : ${MINIMAL ? 'owner accounts + jewellery shop only' : 'full marketplace'}\n`);

  if (has('--tokens')) {
    await printCredentials(null);
    return mongoose.disconnect();
  }

  const partners = MINIMAL ? [] : PARTNER_SELLERS;
  const sellingPartners = partners.filter((p) => !p.noProducts);
  const partnerKeys = new Set(sellingPartners.map((p) => p.key));
  const catalogue = CATALOGUE.filter((r) => r[0] === HOUSE_SELLER.key || partnerKeys.has(r[0]));

  if (DRY) {
    const leaves = CATEGORY_TREE.reduce((n, pair) => n + pair[1].length, 0);
    console.log('Would create:');
    console.log(`  categories : ${CATEGORY_TREE.length} departments + ${leaves} leaves`);
    console.log(`  accounts   : 3 owner${MINIMAL ? '' : ` + ${partners.length} partner sellers + ${DEMO_CUSTOMERS.length} customers`}`);
    console.log(`  sellers    : ${HOUSE_SELLER.businessName} @ 0%`);
    partners.forEach((p) =>
      console.log(`               ${p.businessName} @ ${p.commissionRate}%${p.isApproved ? '' : '  (awaiting approval)'}`)
    );
    console.log(`  products   : ${catalogue.length}`);
    console.log(`  orders     : ${MINIMAL ? 0 : 'a full lifecycle, with commission snapshots'}`);
    console.log('\nDry run. Re-run without --dry to build.');
    return mongoose.disconnect();
  }

  const existing = await User.countDocuments();
  if (existing > 0 && !has('--reset')) {
    throw new Error(
      `${dbName} already has ${existing} users. Re-run with --reset to wipe and rebuild.`
    );
  }
  if (has('--reset')) {
    await mongoose.connection.dropDatabase();
    console.log(`Wiped "${dbName}".\n`);
  }

  // ------------------------------------------------------------ categories
  const leafByName = {};
  for (const [department, subs] of CATEGORY_TREE) {
    const parent = await Category.create({
      name: department,
      description: `Shop ${department.toLowerCase()} on ShopMaster Pro.`,
      isActive: true,
    });
    for (const subName of subs) {
      leafByName[subName] = await Category.create({
        name: subName,
        description: `${subName} - part of ${department}.`,
        parentCategory: parent._id,
        isActive: true,
      });
    }
  }
  const totalCategories = await Category.countDocuments();
  console.log(
    `categories : ${totalCategories}  (${CATEGORY_TREE.length} departments, ${totalCategories - CATEGORY_TREE.length} leaves)`
  );

  // --------------------------------------------------------------- accounts
  const passwords = {};
  const owner = {};
  for (const [key, spec] of Object.entries(ACCOUNTS)) {
    const supplied = process.env[spec.envKey];
    const password = supplied || strongPassword();
    passwords[spec.email] = { password, generated: !supplied, envKey: spec.envKey };
    owner[key] = await User.create({
      name: spec.name,
      email: spec.email,
      password,
      role: spec.role,
      isVerified: true,
    });
  }

  // The owner's jewellery shop.
  await Seller.create({
    userId: owner.seller._id,
    businessName: HOUSE_SELLER.businessName,
    gstNumber: HOUSE_SELLER.gstNumber,
    commissionRate: HOUSE_SELLER.commissionRate,
    isApproved: HOUSE_SELLER.isApproved,
    kycStatus: HOUSE_SELLER.kycStatus,
    status: HOUSE_SELLER.status,
  });

  // One shared password for every generated account keeps testing practical.
  const demoPassword = process.env.SEED_DEMO_PASSWORD || strongPassword();

  const sellerUserByKey = { [HOUSE_SELLER.key]: owner.seller };
  const businessByKey = { [HOUSE_SELLER.key]: HOUSE_SELLER.businessName };

  for (const p of partners) {
    const user = await User.create({
      name: p.name,
      email: p.email,
      password: demoPassword,
      role: 'seller',
      isVerified: true,
    });
    await Seller.create({
      userId: user._id,
      businessName: p.businessName,
      gstNumber: p.gstNumber,
      commissionRate: p.commissionRate,
      isApproved: p.isApproved,
      kycStatus: p.kycStatus,
      status: p.status,
    });
    sellerUserByKey[p.key] = user;
    businessByKey[p.key] = p.businessName;
  }

  const customers = [owner.customer];
  const addressOf = new Map();
  addressOf.set(
    String(owner.customer._id),
    await Address.create({ userId: owner.customer._id, ...OWNER_ADDRESS })
  );

  if (!MINIMAL) {
    for (const c of DEMO_CUSTOMERS) {
      const user = await User.create({
        name: c.name,
        email: c.email,
        password: demoPassword,
        role: 'customer',
        isVerified: true,
      });
      customers.push(user);
      addressOf.set(
        String(user._id),
        await Address.create({ userId: user._id, ...c.address, isDefault: true })
      );
    }
  }
  console.log(`accounts   : ${await User.countDocuments()}  (1 admin, ${1 + partners.length} sellers, ${customers.length} customers)`);

  // --------------------------------------------------------------- products
  const products = [];
  let i = 0;
  for (const [sellerKey, name, leaf, price, mrp, stock, weight, tags] of catalogue) {
    const category = leafByName[leaf];
    if (!category) throw new Error(`Catalogue references unknown category: ${leaf}`);
    const business = businessByKey[sellerKey];

    // save() rather than insertMany, so the slug hook on Product runs.
    const product = new Product({
      name,
      description:
        `${name} - carefully selected and finished to a high standard, ` +
        `dispatched by ${business}.`,
      sellerId: sellerUserByKey[sellerKey]._id,
      category: category._id,
      price,
      mrp,
      stock,
      weight,
      tags,
      brand: business,
      sku: skuFor(business, name, i++),
      images: [PLACEHOLDER_IMAGE],
      lowStockThreshold: 10,
      isActive: true,
    });
    await product.save();
    products.push(product);
  }
  console.log(`products   : ${products.length}`);

  if (MINIMAL) {
    await printCredentials(passwords, demoPassword);
    return mongoose.disconnect();
  }

  // ----------------------------------------------------------- trading data
  await seedTrading(products, customers, addressOf, sellerUserByKey);

  await printCredentials(passwords, demoPassword);
  await mongoose.disconnect();
};

/**
 * A believable trading history: orders in every lifecycle state, from several
 * customers, spanning several sellers. Every order carries a real commission
 * snapshot, so platform revenue on the admin dashboard is genuine.
 *
 * Stock is decremented and an inventory log written for each sale, exactly as
 * the live checkout does, so the numbers on the seller dashboard add up.
 */
const seedTrading = async (products, customers, addressOf, sellerUserByKey) => {
  const pick = (name) => {
    const p = products.find((x) => x.name === name);
    if (!p) throw new Error(`seedTrading references a missing product: ${name}`);
    return p;
  };

  const lineFor = (product, quantity) => ({
    productId: product._id,
    sellerId: product.sellerId,
    name: product.name,
    quantity,
    price: product.price,
  });

  /** Mirrors checkout: stamp commission, write the order, move the stock. */
  const place = async ({ customer, lines, daysBack, ...rest }) => {
    const items = await applyCommission(lines);
    const goods = items.reduce((n, it) => n + it.price * it.quantity, 0);
    const shippingCharges = 100;

    const order = await Order.create({
      customerId: customer._id,
      shippingAddressId: addressOf.get(String(customer._id))._id,
      items,
      totalAmount: goods + shippingCharges,
      shippingCharges,
      shippingProvider: 'shiprocket',
      shippingCourierName: 'DTDC Surface',
      createdAt: daysAgo(daysBack),
      ...rest,
    });

    // Only lines that were actually fulfilled consume stock.
    for (const it of order.items) {
      if (it.status === 'cancelled') continue;
      const product = products.find((p) => String(p._id) === String(it.productId));
      const before = product.stock;
      product.stock = Math.max(0, before - it.quantity);
      await product.save();
      await InventoryLog.create({
        productId: product._id,
        type: 'sale',
        quantity: -it.quantity,
        stockBefore: before,
        stockAfter: product.stock,
        orderId: order._id,
        performedBy: customer._id,
      });
    }
    return order;
  };

  const [ownerBuyer, priya, arjun, fatima] = customers;

  const delivered1 = await place({
    customer: priya,
    lines: [lineFor(pick('Kundan Chandbali Earrings'), 1)],
    daysBack: 26,
    status: 'delivered',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: 'order_SEEDDLV0001',
    razorpayPaymentId: 'pay_SEEDDLV0001',
    deliveredAt: daysAgo(21),
  });

  const delivered2 = await place({
    customer: arjun,
    lines: [lineFor(pick('True Wireless Earbuds Pro'), 1), lineFor(pick('Braided USB-C Cable 2m'), 2)],
    daysBack: 19,
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    deliveredAt: daysAgo(14),
  });

  const delivered3 = await place({
    customer: fatima,
    lines: [lineFor(pick('Banarasi Silk Saree with Blouse'), 1)],
    daysBack: 15,
    status: 'delivered',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: 'order_SEEDDLV0003',
    razorpayPaymentId: 'pay_SEEDDLV0003',
    deliveredAt: daysAgo(10),
  });

  // Owner's own test purchase from their own shop - 0% commission line.
  const delivered4 = await place({
    customer: ownerBuyer,
    lines: [lineFor(pick('White Pearl Layered Necklace'), 1)],
    daysBack: 12,
    status: 'delivered',
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    deliveredAt: daysAgo(8),
  });

  // Mixed basket across two sellers at two different rates.
  await place({
    customer: priya,
    lines: [lineFor(pick('Rose Gold Pearl Floral Ring'), 1), lineFor(pick('Vitamin C Face Serum 30ml'), 2)],
    daysBack: 6,
    status: 'shipped',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: 'order_SEEDSHIP001',
    razorpayPaymentId: 'pay_SEEDSHIP001',
    trackingInfo: { courierName: 'Delhivery', trackingNumber: 'DL77219934', shippedDate: daysAgo(4) },
  });

  await place({
    customer: arjun,
    lines: [lineFor(pick('Leather Formal Derby'), 1)],
    daysBack: 3,
    status: 'processing',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: 'order_SEEDPROC001',
    razorpayPaymentId: 'pay_SEEDPROC001',
  });

  await place({
    customer: fatima,
    lines: [lineFor(pick('Brass Diya Set of 6'), 2)],
    daysBack: 1,
    status: 'pending',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
  });

  // Abandoned prepaid checkout: order exists, money never arrived, stock is NOT
  // consumed. The seller queue must hide this.
  await Order.create({
    customerId: priya._id,
    shippingAddressId: addressOf.get(String(priya._id))._id,
    items: await applyCommission([lineFor(pick('Oxidised Silver Kada'), 1)]),
    totalAmount: pick('Oxidised Silver Kada').price + 100,
    shippingCharges: 100,
    status: 'pending',
    paymentMethod: 'razorpay',
    paymentStatus: 'pending',
    razorpayOrderId: 'order_SEEDABANDON1',
    createdAt: daysAgo(2),
  });

  // Cancelled and refunded, so the refund path has real data behind it.
  const refunded = await place({
    customer: fatima,
    lines: [lineFor(pick('Quilted Puffer Jacket'), 1)],
    daysBack: 9,
    status: 'cancelled',
    paymentMethod: 'razorpay',
    paymentStatus: 'refunded',
    razorpayOrderId: 'order_SEEDRFND001',
    razorpayPaymentId: 'pay_SEEDRFND001',
    refundId: 'rfnd_SEED0001',
    refundStatus: 'completed',
    refundAmount: pick('Quilted Puffer Jacket').price + 100,
    refundedAt: daysAgo(7),
  });
  // A refund returns the goods to stock.
  const jacket = pick('Quilted Puffer Jacket');
  const before = jacket.stock;
  jacket.stock = before + 1;
  await jacket.save();
  await InventoryLog.create({
    productId: jacket._id,
    type: 'return',
    quantity: 1,
    stockBefore: before,
    stockAfter: jacket.stock,
    orderId: refunded._id,
    reason: 'Order cancelled and refunded',
    performedBy: fatima._id,
  });

  console.log(`orders     : ${await Order.countDocuments()}  (every lifecycle state)`);

  // ------------------------------------------------------------- reviews
  // Only verified buyers: each review points at a delivered order of its own.
  const reviews = [
    [pick('Kundan Chandbali Earrings'), priya, delivered1, 5, 'Stunning bridal earrings', 'Exactly as pictured, the kundan work is beautiful. Arrived in four days.'],
    [pick('True Wireless Earbuds Pro'), arjun, delivered2, 4, 'Great value', 'Battery easily lasts a full day. Case feels a bit plasticky.'],
    [pick('Banarasi Silk Saree with Blouse'), fatima, delivered3, 5, 'Rich colour, real silk', 'Wore it to a wedding and got endless compliments.'],
    [pick('White Pearl Layered Necklace'), ownerBuyer, delivered4, 5, 'Beautifully finished', 'The layering sits perfectly, no tangling at all.'],
    [pick('Braided USB-C Cable 2m'), arjun, delivered2, 3, 'Does the job', 'Charges fast enough but the braiding started fraying within a month.'],
  ];

  for (const [product, user, order, rating, title, comment] of reviews) {
    await Review.create({ productId: product._id, userId: user._id, orderId: order._id, rating, title, comment });
  }

  // Keep the denormalised rating on each product in step with its reviews.
  for (const product of new Set(reviews.map((r) => r[0]))) {
    const mine = reviews.filter((r) => r[0] === product);
    const avg = mine.reduce((n, r) => n + r[3], 0) / mine.length;
    await Product.updateOne(
      { _id: product._id },
      { avgRating: Math.round(avg * 10) / 10, totalReviews: mine.length }
    );
  }
  console.log(`reviews    : ${reviews.length}  (all from verified buyers)`);

  // -------------------------------------------------- live carts & wishlist
  await Cart.create({
    userId: ownerBuyer._id,
    items: [
      { productId: pick('Pearl Drop Jhumka')._id, quantity: 1, price: pick('Pearl Drop Jhumka').price },
      { productId: pick('Matte Liquid Lipstick')._id, quantity: 2, price: pick('Matte Liquid Lipstick').price },
    ],
    totalAmount: pick('Pearl Drop Jhumka').price + pick('Matte Liquid Lipstick').price * 2,
  });
  await Wishlist.create({
    userId: priya._id,
    items: [
      { productId: pick('Royal Kundan Bridal Choker Set')._id },
      { productId: pick('Kanjivaram Bridal Saree')._id },
    ],
  });
  console.log('carts      : 1 loaded cart, 1 wishlist');
  console.log(`inv. logs  : ${await InventoryLog.countDocuments()}`);
};

// -------------------------------------------------------------- reporting
const printCredentials = async (passwords, demoPassword) => {
  const users = await User.find().sort({ role: 1, email: 1 }).lean();
  const sellers = await Seller.find().lean();
  const byUser = new Map(sellers.map((s) => [String(s.userId), s]));

  console.log('');
  line('=');
  console.log('ACCOUNTS');
  line('=');
  for (const u of users) {
    const s = byUser.get(String(u._id));
    const detail = s
      ? `  ${s.businessName} @ ${s.commissionRate}%${s.isApproved ? '' : ' (awaiting approval)'}`
      : '';
    console.log(`  ${u.role.padEnd(9)} ${u.email.padEnd(36)}${detail}`);
  }

  if (passwords) {
    console.log('');
    line('=');
    console.log('PASSWORDS - shown once, stored only as bcrypt hashes');
    line('=');
    for (const [email, p] of Object.entries(passwords)) {
      const note = p.generated ? `generated  (set ${p.envKey} to choose your own)` : `from ${p.envKey}`;
      console.log(`  ${email.padEnd(30)} ${p.password.padEnd(24)} ${note}`);
    }
    if (demoPassword) {
      console.log(`\n  Every partner seller and demo customer: ${demoPassword}`);
    }
    console.log('\n  Save these now. Change them after first login.');
  }

  console.log('');
  line('=');
  console.log('API TOKENS (valid 30 days) - owner accounts only');
  line('=');
  const ownerEmails = Object.values(ACCOUNTS).map((a) => a.email);
  for (const u of users.filter((x) => ownerEmails.includes(x.email))) {
    console.log(`\n# ${u.role} - ${u.email}`);
    console.log(token(u));
  }
  console.log('');
};

run().catch(async (err) => {
  console.error(`\nSeed failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
