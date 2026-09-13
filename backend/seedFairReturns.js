/**
 * seedFairReturns.js - the Fair Returns cases, on the dev database (plan
 * §4.39). Add-only and resumable, like seedMessy.js: every order this script
 * makes carries "FAIRRET" in its razorpayOrderId, and a rerun skips what is
 * there. Evidence photos are Cloudinary's public demo images - the flows are
 * what is being tested, not the pictures.
 *
 *   A  a pending parcel WITH pack proof                 (seller page: proof saved)
 *   B  a "damaged" return, 2 customer photos, 6 h in    (seller: check it; admin: photos)
 *   C  a return the seller found worn - not-OK with
 *      photos, pack proof present → seller-raised dispute (admin: brief compares both)
 *   D  a change-of-mind return on a ₹6,000 item that
 *      waits for the admin (adminReviewAbove)          (admin: Approve / Refuse)
 *   E  a customer put on "prepaid only" with a reason  (checkout refuses COD)
 *   F  a customer on "returns approval"                (their returns wait)
 *
 *   node seedFairReturns.js          apply
 *   node seedFairReturns.js --dry    say what would be added
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Address = require('./models/Address');
const Order = require('./models/Order');
const { applyCommission } = require('./utils/commission');

const DRY = process.argv.includes('--dry');
const TAG = 'FAIRRET';
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const hoursAgo = (n) => new Date(Date.now() - n * 3600000);
const IMG = (n) => `https://res.cloudinary.com/demo/image/upload/w_800/${['sample', 'shoes', 'couple', 'accessories-bag', 'balloons'][n % 5]}.jpg`;

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const customers = await User.find({ role: 'customer' }).sort({ createdAt: 1 }).limit(5).lean();
  if (customers.length < 3) throw new Error('need customers - run seed.js first');
  const [c1, c2, c3] = customers;
  const seller = await User.findOne({ email: 'rajatmittal6908@gmail.com' }).lean();
  if (!seller) throw new Error('seller 6908 not found');
  const addressOf = async (u) => {
    const a = await Address.findOne({ userId: u._id }).lean();
    if (!a) throw new Error(`${u.email} has no address`);
    return a;
  };
  const mine = await Product.find({ sellerId: seller._id, isDeleted: { $ne: true }, isActive: true }).sort({ price: -1 }).lean();
  if (mine.length < 4) throw new Error('need at least four live products for the seller');
  const costly = mine.find((p) => p.price >= 5000) || mine[0];
  const cheap = [...mine].reverse().find((p) => p.price < 500 && p.price > 1) || mine[mine.length - 1];
  const mid = mine.find((p) => p.price >= 500 && p.price < 3000) || mine[1];
  const mid2 = mine.find((p) => p !== mid && p.price >= 500 && p.price < 3000) || mine[2];
  const line = (p, quantity = 1) => ({ productId: p._id, sellerId: p.sellerId, name: p.name, quantity, price: p.price });

  const done = [];
  const skipped = [];
  const order = async (label, key, { customer, lines, daysBack, fulfil, paymentMethod = 'razorpay', ...rest }) => {
    const razorpayOrderId = `${TAG}_${key}`;
    if (await Order.findOne({ razorpayOrderId })) {
      skipped.push(label);
      return null;
    }
    done.push(label);
    if (DRY) return null;
    const items = await applyCommission(lines);
    const goods = items.reduce((n, it) => n + it.price * it.quantity, 0);
    const doc = new Order({
      customerId: customer._id,
      shippingAddressId: (await addressOf(customer))._id,
      items,
      fulfilments: [{ sellerId: seller._id, ...fulfil }],
      totalAmount: goods + 100,
      shippingCharges: 100,
      paymentMethod,
      paymentStatus: 'paid',
      razorpayOrderId,
      razorpayPaymentId: `pay_${TAG}_${key}`,
      shippingProvider: 'shiprocket',
      shippingCourierName: 'Delhivery Surface',
      createdAt: daysAgo(daysBack),
      ...rest,
    });
    await doc.save();
    return doc;
  };

  // A. pending with pack proof
  await order('A · pending parcel with pack proof', 'A', {
    customer: c2, lines: [line(mid)], daysBack: 0.2, status: 'processing',
    fulfil: { status: 'processing', packProof: { url: IMG(0), publicId: null, at: hoursAgo(1) } },
  });

  // B. damaged return, photos, 6 h after delivery
  await order('B · "arrived damaged" with 2 photos, 6 h after delivery', 'B', {
    customer: c3, lines: [line(mid2)], daysBack: 4, status: 'delivered', deliveredAt: hoursAgo(8),
    fulfil: {
      status: 'delivered', shippedAt: daysAgo(3), deliveredAt: hoursAgo(8), deliveryConfirmedBy: 'courier', awb: `DLV${TAG}B`, courierName: 'Delhivery Surface', courierStatus: 'Delivered', podUrl: IMG(1),
      packProof: { url: IMG(2), publicId: null, at: daysAgo(3) },
      returnStage: 'requested', returnRequestedAt: hoursAgo(2), returnReason: 'Box was crushed, the stone came out of the pendant', returnKind: 'damaged', returnEvidence: [IMG(3), IMG(4)], returnTagIntact: null, returnResolution: 'refund',
    },
  });

  // C. came back worn - seller not-OK with photos, pack proof present → dispute raised by seller
  await order('C · return came back worn: pack proof vs receipt photos → seller-raised dispute', 'C', {
    customer: c1, lines: [line(mid)], daysBack: 12, status: 'delivered', deliveredAt: daysAgo(9),
    fulfil: {
      status: 'delivered', shippedAt: daysAgo(11), deliveredAt: daysAgo(9), deliveryConfirmedBy: 'courier', awb: `DLV${TAG}C`, courierName: 'Delhivery Surface', courierStatus: 'Delivered', podUrl: IMG(0),
      packProof: { url: IMG(1), publicId: null, at: daysAgo(11) },
      returnStage: 'picked', returnRequestedAt: daysAgo(7), returnReason: 'Did not like the finish', returnKind: 'change_of_mind', returnEvidence: [], returnTagIntact: true, returnResolution: 'refund', returnAwb: `RET${TAG}C`, returnBookedAt: daysAgo(6),
      receiptCheck: { ok: false, photos: [IMG(2), IMG(3)], note: 'Tag cut off, clasp scratched, worn - not the piece I packed', at: hoursAgo(20) },
      disputeStatus: 'open', disputeRaisedBy: 'seller', disputeReason: 'Return came back not as sent: Tag cut off, clasp scratched, worn - not the piece I packed', disputeRaisedAt: hoursAgo(20), disputeSellerNote: 'Tag cut off, clasp scratched, worn - not the piece I packed', disputeSellerEvidence: [IMG(2), IMG(3)], disputeSellerRespondedAt: hoursAgo(20),
    },
  });

  // D. big-ticket change of mind, waiting for the admin
  await order('D · ₹5,000+ change-of-mind return waiting for admin approval', 'D', {
    customer: c2, lines: [line(costly)], daysBack: 5, status: 'delivered', deliveredAt: daysAgo(3),
    fulfil: {
      status: 'delivered', shippedAt: daysAgo(4), deliveredAt: daysAgo(3), deliveryConfirmedBy: 'courier', awb: `DLV${TAG}D`, courierName: 'Delhivery Surface', courierStatus: 'Delivered', podUrl: IMG(4),
      packProof: { url: IMG(0), publicId: null, at: daysAgo(4) },
      returnStage: 'requested', returnRequestedAt: hoursAgo(5), returnReason: 'Bought two, keeping one', returnKind: 'change_of_mind', returnEvidence: [], returnTagIntact: true, returnResolution: 'refund', returnNeedsApproval: true,
    },
  });

  // E / F. risk levels on two customers
  for (const [label, u, level, reason] of [
    ['E · customer on prepaid-only', c1, 'prepaid_only', 'Two COD parcels refused at the door in August; pay online for now'],
    ['F · customer on returns-approval', c3, 'returns_approval', '3 of 4 returns since July came back worn or without the tag'],
  ]) {
    const cur = await User.findById(u._id).select('risk').lean();
    if (cur?.risk?.level === level) {
      skipped.push(label);
      continue;
    }
    done.push(label);
    if (!DRY) await User.updateOne({ _id: u._id }, { $set: { risk: { level, reason, setAt: new Date(), setBy: null } } });
  }

  console.log(`${DRY ? 'would add' : 'added'}: ${done.join(' · ') || 'nothing'}`);
  if (skipped.length) console.log(`already there: ${skipped.join(' · ')}`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
