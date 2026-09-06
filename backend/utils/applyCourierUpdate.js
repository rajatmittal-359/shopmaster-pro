const { normaliseCourierStatus, FULFILMENT_STATE } = require('./courierStatus');

/**
 * Writing a courier's word onto a parcel.
 *
 * WHY IT IS NOT INSIDE THE WEBHOOK ANY MORE
 *   This logic decides when deliveredAt is set - which starts the return
 *   window, which releases the seller's money - and when COD counts as
 *   collected. It lived inside the webhook handler, so it could only ever run
 *   when Shiprocket successfully called us.
 *
 *   A webhook is a single delivery attempt to a server that sleeps on a free
 *   Render plan. Miss the one that says "delivered" and nothing else in the
 *   system ever notices: the parcel sits at 'shipped' forever, the return
 *   window never opens, and that seller is simply never paid. Nothing on any
 *   screen would explain why.
 *
 *   So the reconciler (jobs/trackingReconcile.js) polls the same couriers and
 *   feeds what it finds through THIS function. Two sources, one set of rules -
 *   the alternative was two copies that quietly drift until they disagree about
 *   whether somebody has been paid.
 *
 * It does not save. The caller decides that, because the webhook and the
 * reconciler have different ideas about what to do afterwards.
 */

/**
 * How far along a parcel is, as a number, so it can only ever move forwards.
 * 'returned' and 'cancelled' share the top: both are ends of the road.
 */
const RANK = {
  pending: 0,
  processing: 1,
  shipped: 2,
  delivered: 3,
  returned: 4,
  cancelled: 4,
};

/**
 * @param {object} order       the parent order document (mutated)
 * @param {object} fulfilment  the parcel this update is about (mutated)
 * @param {object} update      { status, statusId, reason, at, etd, scans }
 * @returns {{changed: boolean, was: string, now: string}}
 */
const applyCourierUpdate = (order, fulfilment, update = {}) => {
  const { status, statusId, reason, at, etd, scans = [] } = update;

  const was = fulfilment.status;
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date();

  /*
   * THE FACTS FIRST, whether or not we understand the status word.
   *
   * This used to bail out the moment normaliseCourierStatus returned null, and
   * throw the whole update away with it. Found by running the reconciler
   * against a real parcel: Shiprocket said "Pickup Generated" - which we have
   * no rule for - and carried an ETD of 14 September and a first scan. Both
   * were discarded, so the customer's page had no arrival date and an empty
   * timeline while the courier had already told us.
   *
   * The status word decides a STATE TRANSITION, which is a judgement. The scans
   * and the ETD are observations, and an observation we cannot classify is
   * still true.
   */
  if (status) {
    fulfilment.courierStatus = status;
    fulfilment.courierStatusAt = when;
  }

  if (etd && !Number.isNaN(Date.parse(etd))) {
    // Couriers revise this as the parcel moves, so the latest word wins.
    fulfilment.expectedDeliveryAt = new Date(etd);
  }

  if (scans.length) {
    // Replace rather than append: each event carries the WHOLE history, so
    // appending would duplicate every earlier stop on every update. Capped at
    // 30 - older scans stop being interesting once a parcel has arrived.
    fulfilment.scans = scans.slice(0, 30);
  }

  // Their own code wins for the one status that releases money; the wording is
  // the fallback for everything else. Unrecognised means "no opinion on where
  // the parcel is" - not "ignore everything the courier just said".
  const mapped = statusId === 7 ? 'delivered' : normaliseCourierStatus(status);
  if (!mapped) return { changed: false, was, now: was };

  if (mapped === 'ndr') {
    // Deliberately not a status. The parcel has not moved backwards and the
    // courier will try again, so overwriting 'shipped' would lose where it is.
    fulfilment.ndrReason = reason || status;
    fulfilment.ndrAt = when;
    return { changed: was !== fulfilment.status, was, now: fulfilment.status };
  }

  const next = FULFILMENT_STATE[mapped];

  // Never walk a parcel backwards. Couriers resend events, and out-of-order
  // arrival must not turn a delivered parcel into one in transit.
  if (next && (RANK[next] ?? 0) >= (RANK[fulfilment.status] ?? 0)) {
    fulfilment.status = next;
  }

  if (next === 'delivered') {
    if (!fulfilment.deliveredAt) fulfilment.deliveredAt = when;

    /*
     * The courier's word, recorded as the courier's word.
     *
     * This overwrites a seller's earlier claim on purpose. Both cannot be the
     * source, and of the two only the courier has nothing to gain from the
     * answer - so when the tracking feed speaks, that is what the record says.
     */
    fulfilment.deliveryConfirmedBy = 'courier';

    /*
     * COD is collected at the door by the courier, so their delivery scan is
     * the only honest signal that the cash exists. Marked only when the WHOLE
     * basket has been handed over: in a split order one seller delivering says
     * nothing about the other's parcel, and the customer pays per parcel.
     */
    const everyPartDone = order.fulfilments
      .filter((f) => f.status !== 'cancelled')
      .every((f) => ['delivered', 'returned'].includes(f.status));

    if (
      order.paymentMethod === 'cod' &&
      order.paymentStatus === 'pending' &&
      everyPartDone
    ) {
      order.paymentStatus = 'paid';
    }
  }

  if (next === 'returned' && !fulfilment.returnedAt) fulfilment.returnedAt = when;
  if (next === 'shipped' && !fulfilment.shippedAt) fulfilment.shippedAt = when;

  return { changed: fulfilment.status !== was, was, now: fulfilment.status };
};

module.exports = { applyCourierUpdate, RANK };
