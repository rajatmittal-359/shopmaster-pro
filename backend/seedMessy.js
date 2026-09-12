/**
 * seedMessy.js - the ugly cases, added to the dev database.
 *
 * WHY
 *   seed.js builds a believable happy history. Real shops are not happy: a
 *   courier fails at the door, a customer says "delivered but nothing came",
 *   a seller cancels once too often, a coupon expires mid-campaign, a return
 *   sits in transit, a seller gets suspended, a product runs out or has no
 *   photo. Rajat, 12 Sep 2026: realistic data is how edge cases surface
 *   before a customer finds them. Every state below has a page that must
 *   draw it and a rule that must hold; this puts one of each in front of us.
 *
 * WHAT IT DOES NOT DO
 *   Delete or reset anything. It adds, once: every document it makes carries
 *   the MESSY marker and a step whose marker exists is skipped, so running it
 *   again is safe. Products it needs
 *   are the seeded ones; if the catalogue was changed, it says which name it
 *   could not find and stops before writing.
 *
 *   node seedMessy.js          add the cases
 *   node seedMessy.js --dry    list what it would add
 */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./models/User');
const Seller = require('./models/Seller');
const Product = require('./models/Product');
const Address = require('./models/Address');
const Order = require('./models/Order');
const Coupon = require('./models/Coupon');
const Payout = require('./models/Payout');
const SellerCharge = require('./models/SellerCharge');
const InventoryLog = require('./models/Inventory');
const { applyCommission } = require('./utils/commission');
const RULES = require('./config/sellerRules');

const DRY = process.argv.includes('--dry');
const MESSY = 'MESSY'; // in every razorpayOrderId / coupon description / note this script writes
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const hoursAgo = (n) => new Date(Date.now() - n * 3600000);

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db.databaseName;

  // Each step is skipped if its marker is already there, so a run that stopped
  // halfway (a validation error, a dropped connection) is simply run again.
  const skipped = [];

  // ------------------------------------------------------------ the cast
  const customers = await User.find({ role: 'customer' }).sort({ createdAt: 1 }).limit(4).lean();
  if (customers.length < 3) throw new Error('need at least three customers - run seed.js first');
  const [c1, c2, c3] = customers;
  const addressOf = async (u) => {
    const a = await Address.findOne({ userId: u._id }).lean();
    if (!a) throw new Error(`${u.email} has no address`);
    return a;
  };

  const need = async (name) => {
    const p = await Product.findOne({ name, isDeleted: { $ne: true } });
    if (!p) throw new Error(`product not found: "${name}" - the catalogue changed; edit the names in seedMessy.js`);
    return p;
  };
  const line = (p, quantity = 1) => ({ productId: p._id, sellerId: p.sellerId, name: p.name, quantity, price: p.price });

  const jhumka = await need('Pearl Drop Jhumka');
  const kada = await need('Oxidised Silver Kada');
  const earbuds = await need('True Wireless Earbuds Pro');
  const serum = await need('Vitamin C Face Serum 30ml');
  const saree = await need('Kanjivaram Bridal Saree');
  const derby = await need('Leather Formal Derby');
  const diya = await need('Brass Diya Set of 6');
  const lipstick = await need('Matte Liquid Lipstick');

  // A partner with products on the storefront, so the suspension is visible.
  const partnerSeller = await Seller.findOne({ userId: serum.sellerId, status: 'active' }).lean();

  const plan = [];
  const say = (what) => plan.push(what);

  /** An order shaped exactly as checkout leaves it, then bent into the case. */
  const order = async (label, { customer, lines, daysBack, fulfil, ...rest }) => {
    if (await Order.exists({ razorpayOrderId: rest.razorpayOrderId })) {
      skipped.push(label);
      return null;
    }
    say(label);
    if (DRY) return null;
    const items = await applyCommission(lines);
    const goods = items.reduce((n, it) => n + it.price * it.quantity, 0);
    const shippingCharges = rest.shippingCharges ?? 100;
    const doc = new Order({
      customerId: customer._id,
      shippingAddressId: (await addressOf(customer))._id,
      items,
      totalAmount: goods + shippingCharges - (rest.discountAmount || 0),
      shippingCharges,
      shippingProvider: 'shiprocket',
      shippingCourierName: 'Delhivery Surface',
      createdAt: daysAgo(daysBack),
      ...rest,
    });
    // One fulfilment per seller is added by the model; shape each one here.
    doc.validateSync();
    for (const f of doc.fulfilments) Object.assign(f, typeof fulfil === 'function' ? fulfil(f) : fulfil);
    await doc.save();
    for (const it of doc.items) {
      if (it.status === 'cancelled') continue;
      const p = await Product.findById(it.productId);
      const before = p.stock;
      p.stock = Math.max(0, before - it.quantity);
      await p.save();
      await InventoryLog.create({ productId: p._id, type: 'sale', quantity: -it.quantity, stockBefore: before, stockAfter: p.stock, orderId: doc._id, performedBy: customer._id });
    }
    return doc;
  };

  const shipped = (awb, daysBackShipped, extra = {}) => ({
    status: 'shipped',
    shippedAt: daysAgo(daysBackShipped),
    shippingProvider: 'shiprocket',
    awb,
    courierName: 'Delhivery Surface',
    courierStatus: 'In Transit',
    courierStatusAt: daysAgo(daysBackShipped - 1),
    expectedDeliveryAt: daysAgo(daysBackShipped - 4),
    scans: [
      { at: daysAgo(daysBackShipped), activity: 'Picked up', location: 'Jaipur' },
      { at: daysAgo(daysBackShipped - 1), activity: 'In transit', location: 'Jaipur Hub' },
    ],
    ...extra,
  });

  // 1. NDR - the courier tried twice, nobody home. Seller and customer both need to act.
  await order('NDR order: two failed attempts, parcel still with the courier', {
    customer: c1,
    lines: [line(earbuds)],
    daysBack: 7,
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: `order_${MESSY}NDR001`,
    razorpayPaymentId: `pay_${MESSY}NDR001`,
    fulfil: shipped('DLV' + MESSY + '0001', 5, {
      courierStatus: 'Undelivered',
      ndrReason: 'Customer not available, phone unreachable',
      ndrAt: hoursAgo(20),
      ndrAttempts: 2,
      scans: [
        { at: daysAgo(5), activity: 'Picked up', location: 'Jaipur' },
        { at: daysAgo(2), activity: 'Out for delivery', location: 'Delhi' },
        { at: daysAgo(2), activity: 'Undelivered - customer not available', location: 'Delhi' },
        { at: hoursAgo(20), activity: 'Undelivered - phone unreachable', location: 'Delhi' },
      ],
    }),
  });

  // 2. NPR - marked shipped ten days ago, the courier never collected it.
  await order('NPR order: "shipped" for ten days, courier never picked it up', {
    customer: c2,
    lines: [line(diya, 2)],
    daysBack: 11,
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    razorpayOrderId: `order_${MESSY}NPR001`,
    fulfil: shipped('DLV' + MESSY + '0002', 10, {
      courierStatus: 'Pickup Scheduled',
      nprReason: 'Pickup not attempted by courier for 3 days',
      scans: [{ at: daysAgo(10), activity: 'Pickup scheduled', location: 'Jaipur' }],
      expectedDeliveryAt: daysAgo(4),
    }),
  });

  // 3. Dispute, open, inside 72 h - "delivered" with a POD, customer says nothing came.
  await order('Open dispute, 30 h old: courier says delivered with POD, customer says nothing arrived', {
    customer: c3,
    lines: [line(kada)],
    daysBack: 9,
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: `order_${MESSY}DSP001`,
    razorpayPaymentId: `pay_${MESSY}DSP001`,
    deliveredAt: hoursAgo(40),
    fulfil: shipped('DLV' + MESSY + '0003', 6, {
      status: 'delivered',
      deliveredAt: hoursAgo(40),
      courierStatus: 'Delivered',
      courierStatusAt: hoursAgo(40),
      podUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      disputeStatus: 'open',
      disputeReason: 'Tracking says delivered but nothing was received. Nobody at home signed for anything.',
      disputeRaisedAt: hoursAgo(30),
      scans: [
        { at: daysAgo(6), activity: 'Picked up', location: 'Jaipur' },
        { at: daysAgo(3), activity: 'Reached destination hub', location: 'Mumbai' },
        { at: hoursAgo(40), activity: 'Delivered - signed by neighbour', location: 'Mumbai' },
      ],
    }),
  });

  // 4. Dispute resolved for the customer, refund done - the ledger must show both.
  await order('Dispute resolved for the customer 4 days ago, refunded', {
    customer: c1,
    lines: [line(serum, 2)],
    daysBack: 16,
    paymentMethod: 'razorpay',
    paymentStatus: 'refunded',
    razorpayOrderId: `order_${MESSY}DSP002`,
    razorpayPaymentId: `pay_${MESSY}DSP002`,
    refundId: `rfnd_${MESSY}0002`,
    refundStatus: 'completed',
    refundAmount: serum.price * 2 + 100,
    refundedAt: daysAgo(4),
    deliveredAt: daysAgo(10),
    fulfil: shipped('DLV' + MESSY + '0004', 13, {
      status: 'delivered',
      deliveredAt: daysAgo(10),
      courierStatus: 'Delivered',
      disputeStatus: 'resolved_customer',
      disputeReason: 'Both bottles arrived leaking; photos attached.',
      disputeRaisedAt: daysAgo(9),
      disputeResolvedAt: daysAgo(4),
      disputeResolution: 'Photos show damage in transit. Full refund; seller not at fault, courier claim filed.',
    }),
  });

  // 5. Partial cancel with a seller penalty - one line cancelled by the seller past the free allowance.
  const partial = await order('Seller cancelled one of two lines - beyond the free allowance, penalty charged', {
    customer: c2,
    lines: [line(jhumka), line(lipstick, 2)],
    daysBack: 4,
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: `order_${MESSY}PEN001`,
    razorpayPaymentId: `pay_${MESSY}PEN001`,
    fulfil: (f) =>
      String(f.sellerId) === String(jhumka.sellerId)
        ? { status: 'cancelled', cancelPenalty: RULES.cancelPenalty }
        : { status: 'processing' },
  });
  if (partial) {
    const cancelled = partial.items.find((it) => String(it.productId) === String(jhumka._id));
    cancelled.status = 'cancelled';
    await partial.save();
    await SellerCharge.create({
      sellerId: jhumka.sellerId,
      orderId: partial._id,
      orderNumber: partial.orderNumber,
      kind: 'seller_cancel',
      amount: RULES.cancelPenalty,
      note: `${MESSY}: third seller cancellation in 30 days - stock was not actually available`,
    });
  }

  // 6. Return in transit - customer changed their mind, reverse pickup done, parcel on its way back.
  await order('Return picked up, on its way back to the seller (refund not yet due)', {
    customer: c3,
    lines: [line(derby)],
    daysBack: 14,
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayOrderId: `order_${MESSY}RET001`,
    razorpayPaymentId: `pay_${MESSY}RET001`,
    deliveredAt: daysAgo(8),
    fulfil: shipped('DLV' + MESSY + '0006', 11, {
      status: 'delivered',
      deliveredAt: daysAgo(8),
      courierStatus: 'Delivered',
      returnStage: 'picked',
      returnRequestedAt: daysAgo(5),
      returnReason: 'Size too small',
      returnNote: 'Ordered 9, fits like an 8.',
      returnResolution: 'refund',
      returnAwb: 'RVP' + MESSY + '0006',
      returnBookedAt: daysAgo(4),
    }),
  });

  // 7. Replacement due - customer wanted the same saree again, not their money.
  await order('Return received, replacement due to ship', {
    customer: c1,
    lines: [line(saree)],
    daysBack: 20,
    paymentMethod: 'cod',
    paymentStatus: 'paid',
    razorpayOrderId: `order_${MESSY}REP001`,
    deliveredAt: daysAgo(13),
    fulfil: shipped('DLV' + MESSY + '0007', 17, {
      status: 'delivered',
      deliveredAt: daysAgo(13),
      courierStatus: 'Delivered',
      returnStage: 'received',
      returnRequestedAt: daysAgo(11),
      returnReason: 'Colour different from photo',
      returnResolution: 'replacement',
      returnAwb: 'RVP' + MESSY + '0007',
      returnBookedAt: daysAgo(10),
      replacementStage: 'due',
      replacementDueAt: daysAgo(-1),
    }),
  });

  // 8. Coupons: one expired last week, one live, one seller-funded with a cap.
  if (await Coupon.exists({ code: 'WELCOME10' })) skipped.push('coupons');
  else say('Coupons: WELCOME10 expired, JAIPUR15 live and capped, one seller-funded flat ₹100');
  if (!DRY && !(await Coupon.exists({ code: 'WELCOME10' }))) {
    await Coupon.create([
      { code: 'WELCOME10', description: `${MESSY} first-order 10% - expired`, type: 'percent', value: 10, maxDiscount: 200, minOrderValue: 499, fundedBy: 'platform', validFrom: daysAgo(40), validUntil: daysAgo(7), usedCount: 3 },
      { code: 'JAIPUR15', description: `${MESSY} 15% off, max ₹300, live`, type: 'percent', value: 15, maxDiscount: 300, minOrderValue: 999, fundedBy: 'platform', validFrom: daysAgo(3), validUntil: daysAgo(-27), usageLimit: 100 },
      { code: 'CJ100', description: `${MESSY} ₹100 off Charming Jewels above ₹1499`, type: 'flat', value: 100, minOrderValue: 1499, fundedBy: 'seller', sellerId: jhumka.sellerId, validFrom: daysAgo(10), validUntil: daysAgo(-20) },
    ]);
  }

  // 9. A payout that carried a deduction - the seller's statement must show the minus.
  const payoutRef = `UTR${MESSY}0001`;
  if (await Payout.exists({ reference: payoutRef })) skipped.push('payout');
  else say('Payout (paid) for the house shop with a ₹50 deduction line');
  if (!DRY && !(await Payout.exists({ reference: payoutRef }))) {
    const admin = await User.findOne({ role: 'admin' }).lean();
    const house = await Seller.findOne({ userId: jhumka.sellerId }).lean();
    const p = await Payout.create({
      sellerId: jhumka.sellerId,
      businessName: house?.businessName || 'Charming Jewels',
      periodFrom: daysAgo(37),
      periodTo: daysAgo(30),
      itemCount: 3,
      grossSales: 2400,
      commission: 0,
      deductions: RULES.cancelPenalty,
      netPayable: 2400 - RULES.cancelPenalty,
      status: 'paid',
      reference: payoutRef,
      createdBy: admin._id,
      paidAt: daysAgo(28),
    });
    await SellerCharge.create({ sellerId: jhumka.sellerId, kind: 'seller_cancel', amount: RULES.cancelPenalty, note: `${MESSY}: claimed by payout`, payoutId: p._id, claimedAt: daysAgo(28) });
  }

  // 10. A suspended seller - their products must vanish from the shop, their panel must say why.
  if (!partnerSeller) skipped.push('suspension (already suspended or no partner with products)');
  else {
    say(`Suspend partner seller "${partnerSeller.businessName}" (their products leave the storefront)`);
    if (!DRY) await Seller.updateOne({ _id: partnerSeller._id }, { status: 'suspended', suspensionReason: `${MESSY}: repeated late dispatch, review at 30 days` });
  }

  // 11. Catalogue edge cases: out of stock, no photo, no description - the listing score's bottom.
  const toeSku = `CJ-${MESSY}-TOE`;
  if (await Product.exists({ sku: toeSku })) skipped.push('products');
  else say('Products: Oxidised Silver Kada → 0 stock; a photo-less, tag-less "Silver Toe Ring" at ₹149 (listing score near zero)');
  if (!DRY && !(await Product.exists({ sku: toeSku }))) {
    await Product.updateOne({ _id: kada._id }, { stock: 0 });
    await new Product({
      name: 'Silver Toe Ring',
      description: 'Silver toe ring.',
      sellerId: jhumka.sellerId,
      category: jhumka.category,
      price: 149,
      mrp: 199,
      stock: 25,
      weight: 5,
      tags: [],
      brand: jhumka.brand,
      sku: toeSku,
      images: [],
      isActive: true,
    }).save();
  }

  // 12. An address Borzo will not take (outside Jaipur) and a pincode Shiprocket serves slowly.
  if (await Address.exists({ userId: c2._id, zipCode: '194101' })) skipped.push('address');
  else say(`Address for ${c2.email}: Leh 194101 - no same-day, slow surface`);
  if (!DRY && !(await Address.exists({ userId: c2._id, zipCode: '194101' }))) {
    await Address.create({ userId: c2._id, label: 'Parents', phoneNumber: '9876500001', street: 'Changspa Road, near Shanti Stupa', city: 'Leh', state: 'Ladakh', zipCode: '194101', isDefault: false });
  }

  console.log(`${DRY ? 'Would add' : 'Added'} to ${db}:\n` + (plan.map((p, i) => `  ${String(i + 1).padStart(2)}. ${p}`).join('\n') || '  nothing'));
  if (skipped.length) console.log(`Already there, skipped ${skipped.length}: ${skipped.map((s) => s.split(':')[0]).join('; ')}`);
  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
