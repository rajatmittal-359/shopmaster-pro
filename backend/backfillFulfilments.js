/**
 * Gives every existing order its per-seller fulfilments.
 *
 * WHY THIS IS NOT OPTIONAL
 *   Orders written before the fulfilment change carry only an order-level
 *   `status`. Payout now reads delivery PER SELLER, from `fulfilments`, and a
 *   line whose seller has no fulfilment is treated as not yet delivered - the
 *   deliberately safe default. So until this runs, every historical delivered
 *   order drops out of the payable pool and sellers appear to be owed nothing.
 *
 *   Run it once, immediately after deploying the fulfilment change.
 *
 * WHAT IT RECONSTRUCTS
 *   A historical order has one status for the whole basket, so that is the
 *   best available answer for each of its sellers: every seller in the order
 *   inherits the order's status and deliveredAt, plus whatever courier details
 *   the order recorded. For single-seller orders - which is all of them today -
 *   that reconstruction is exact.
 *
 *   node backfillFulfilments.js --dry     report only, write nothing
 *   node backfillFulfilments.js           apply
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('./models/Order');

const DRY = process.argv.includes('--dry');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.name}`);
  console.log(DRY ? 'DRY RUN - nothing will be written\n' : 'APPLYING\n');

  // Only orders that have not been given fulfilments yet, so re-running is safe.
  const orders = await Order.find({
    $or: [{ fulfilments: { $exists: false } }, { fulfilments: { $size: 0 } }],
  });

  console.log(`Orders needing backfill: ${orders.length}\n`);

  let written = 0;

  for (const order of orders) {
    const bySeller = new Map();
    order.items.forEach((i) => bySeller.set(String(i.sellerId), i.sellerId));

    const fulfilments = [...bySeller.values()].map((sellerId) => ({
      sellerId,
      status: order.status,
      // Only a delivered order has a meaningful delivery date to inherit.
      deliveredAt: order.status === 'delivered' ? order.deliveredAt : null,
      returnedAt: order.status === 'returned' ? order.updatedAt : null,
      shippedAt: order.trackingInfo?.shippedDate || null,
      shippingProvider: order.shippingProvider || 'none',
      awb: order.shippingAwb || null,
      courierName: order.shippingCourierName || order.trackingInfo?.courierName || null,
      shipmentId: order.shippingShipmentId || null,
      shippingOrderId: order.shippingOrderId || null,
      trackingUrl: order.shippingTrackingUrl || null,
    }));

    const sellerCount = fulfilments.length;
    const flag = sellerCount > 1 ? '  <- SPLIT ORDER' : '';
    console.log(
      `  ${order.orderNumber}  ${String(order.status).padEnd(10)} ` +
        `sellers=${sellerCount} deliveredAt=${order.deliveredAt ? order.deliveredAt.toISOString().slice(0, 10) : '-'}${flag}`
    );

    if (!DRY) {
      // Written straight to the collection: the pre-validate hook would also
      // build these, but going through it would re-derive and re-save every
      // other field on documents this script has no business touching.
      await Order.collection.updateOne(
        { _id: order._id },
        { $set: { fulfilments } }
      );
      written += 1;
    }
  }

  const delivered = orders.filter((o) => o.status === 'delivered').length;
  console.log(`\n  delivered orders in this batch : ${delivered}`);
  console.log(`  documents updated              : ${written}`);

  if (DRY) console.log('\nDry run - nothing written.');

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('\nBackfill failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
