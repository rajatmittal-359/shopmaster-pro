const Order = require('../models/Order');
// Module objects, not destructured: both are replaced in tests, and a
// destructured copy binds the real function forever.
const shiprocket = require('../utils/shiprocketBooking');
const courierUpdate = require('../utils/applyCourierUpdate');

/**
 * Asking the courier what we might have missed.
 *
 * WHY THIS EXISTS
 *   Tracking was listen-only. Shiprocket posts an event, we write it down, and
 *   that is the entire mechanism - which assumes every one of those posts
 *   arrives. A webhook is a single delivery attempt to a server that sleeps on
 *   a free Render plan, so that assumption is wrong roughly as often as the
 *   server is cold.
 *
 *   Miss the one event that says "delivered" and nothing else in the system
 *   ever notices. The parcel stays 'shipped' forever, deliveredAt is never set,
 *   the return window never opens, and that seller is never paid - with nothing
 *   on any screen to explain why, because from the inside everything looks
 *   normal. That is the worst kind of money bug: silent, and it looks like
 *   nothing happened rather than like something broke.
 *
 *   So this asks. The webhook stays - it is faster, and most of the time it is
 *   right - and this is the net underneath it.
 *
 * WHY IT SHARES THE WEBHOOK'S RULES
 *   Both funnel into utils/applyCourierUpdate.js. Two copies of "what does this
 *   courier status mean for the money" drift, and the day they disagree is the
 *   day one of them pays a seller the other would not have.
 */

/** Parcels worth asking about: sent, not finished, and carrying an AWB. */
const OPEN_STATES = ['shipped'];

/**
 * How many to poll in one pass.
 *
 * Deliberately small. Every one is an HTTP call to Shiprocket, this runs on a
 * shared free dyno, and a parcel found an hour later is no worse off. It is a
 * safety net, not the primary path.
 */
const BATCH = 40;

/**
 * How stale a parcel has to be before we ask again.
 *
 * Under this and the webhook is presumed to be doing its job. Asking about
 * something updated ten minutes ago spends a call to learn nothing.
 */
const STALE_HOURS = 6;

const reconcileOnce = async () => {
  const staleBefore = new Date(Date.now() - STALE_HOURS * 3600 * 1000);

  const orders = await Order.find({
    fulfilments: {
      $elemMatch: {
        status: { $in: OPEN_STATES },
        awb: { $ne: null },
        $or: [
          { courierStatusAt: null },
          { courierStatusAt: { $lte: staleBefore } },
        ],
      },
    },
  })
    .sort({ createdAt: -1 })
    .limit(BATCH);

  let asked = 0;
  let moved = 0;

  for (const order of orders) {
    const parcels = order.fulfilments.filter(
      (f) =>
        OPEN_STATES.includes(f.status) &&
        f.awb &&
        (!f.courierStatusAt || f.courierStatusAt <= staleBefore)
    );

    let dirty = false;

    for (const fulfilment of parcels) {
      asked += 1;

      const result = await shiprocket.trackByAwb(fulfilment.awb);
      if (!result.ok) {
        // Worth seeing, not worth stopping for: a bad AWB on one parcel must
        // not cost every later parcel in this pass its check.
        console.warn(
          `Tracking check failed for ${order.orderNumber} / ${fulfilment.awb}: ${result.reason}`
        );
        continue;
      }

      const { changed } = courierUpdate.applyCourierUpdate(order, fulfilment, {
        status: result.status,
        statusId: result.statusId,
        reason: result.ndrReason,
        // delivered_date is the moment that starts the return window, so it
        // wins over "when this record was last touched" when they differ.
        at: result.deliveredDate || result.at,
        etd: result.etd,
        scans: result.scans,
      });

      /*
       * Things the shared rules do not own, because only tracking carries them.
       * Recorded whether or not the status moved: a second failed delivery
       * attempt is news even though the parcel has not gone anywhere.
       */
      if (result.pod && fulfilment.podUrl !== result.pod) {
        fulfilment.podUrl = result.pod;
        dirty = true;
      }
      if (result.ndrAttempts && fulfilment.ndrAttempts !== result.ndrAttempts) {
        fulfilment.ndrAttempts = result.ndrAttempts;
        if (result.ndrReason) fulfilment.ndrReason = result.ndrReason;
        if (!fulfilment.ndrAt) fulfilment.ndrAt = new Date();
        dirty = true;
      }
      if (result.nprReason && fulfilment.nprReason !== result.nprReason) {
        // Never collected. The seller believes it has gone and the customer is
        // waiting, so this is worth catching early.
        fulfilment.nprReason = result.nprReason;
        dirty = true;
      }

      if (changed) {
        moved += 1;
        dirty = true;
        console.log(
          `Reconciled ${order.orderNumber}: ${fulfilment.status} (${result.status}) - the webhook had missed this`
        );
      } else if (fulfilment.courierStatus !== result.status) {
        dirty = true;
      } else {
        // Nothing new, but say we looked, or this parcel is re-asked every pass.
        fulfilment.courierStatusAt = new Date();
        dirty = true;
      }
    }

    if (dirty) {
      try {
        // save(), not updateOne(): order.status is derived from the fulfilments
        // by the pre-validate hook, and updateOne skips it.
        await order.save();
      } catch (err) {
        console.error(`Could not save reconciled order ${order.orderNumber}:`, err.message);
      }
    }
  }

  return { asked, moved, scanned: orders.length };
};

module.exports = { reconcileOnce, BATCH, STALE_HOURS };
