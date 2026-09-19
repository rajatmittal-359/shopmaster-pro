import { hasLeftTheSeller } from '@/lib/courierText';

/**
 * The customer's words for an order's state (20 Sep 2026).
 *
 * WHY ONE PLACE
 *   The list said "Pending" (the database's word) for a paid order while
 *   the mail said "confirmed"; the order page said "pending" in lowercase;
 *   the seller queue had its own colours for the same states. Amazon,
 *   Flipkart and Shopify never show a system state to a customer - Flipkart's
 *   first step is "Order Confirmed", Shopify's is "Confirmed". This is the
 *   only map from `status` to a word and a tone; every customer surface reads
 *   it, so they cannot disagree again.
 *
 * WHAT THE WORDS MEAN
 *   Confirmed        placed and (for prepaid) paid - the seller has it
 *   Being packed     the seller moved it to processing
 *   On its way       courier booked; Out for delivery once a scan says so
 *   Delivered / Cancelled / Returned
 *   Payment not completed   an online checkout that never paid - reachable by
 *                    its link, never listed (see customerController.getMyOrders)
 */
export const OUT_FOR_DELIVERY = /out for delivery/i;

export const isOutForDelivery = (scans = []) => {
  const latest = [...scans].filter((s) => s.at).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
  return Boolean(latest && OUT_FOR_DELIVERY.test(String(latest.activity || '')));
};

/**
 * @param {object} order      the order (paymentMethod, paymentStatus, status)
 * @param {object} [parcel]   this seller's fulfilment when the page has one (status, scans)
 * @returns {{ key: string, label: string, tone: 'brand'|'sky'|'emerald'|'amber'|'muted'|'destructive' }}
 */
export const customerStatus = (order = {}, parcel = null) => {
  const status = parcel?.status || order.status || 'pending';
  const scans = Array.isArray(parcel?.scans) ? parcel.scans : [];
  if (order.paymentMethod === 'razorpay' && order.paymentStatus === 'pending' && status === 'pending') {
    return { key: 'unpaid', label: 'Payment not completed', tone: 'amber' };
  }
  switch (status) {
    case 'pending':
      return { key: 'confirmed', label: 'Confirmed', tone: 'brand' };
    case 'processing':
      return { key: 'packing', label: 'Being packed', tone: 'brand' };
    case 'shipped':
      return isOutForDelivery(scans)
        ? { key: 'out', label: 'Out for delivery', tone: 'sky' }
        : { key: 'shipped', label: hasLeftTheSeller(scans) ? 'On its way' : 'Courier booked', tone: 'sky' };
    case 'delivered':
      return { key: 'delivered', label: 'Delivered', tone: 'emerald' };
    case 'cancelled':
      return { key: 'cancelled', label: 'Cancelled', tone: 'destructive' };
    case 'returned':
      return { key: 'returned', label: 'Returned', tone: 'muted' };
    default:
      return { key: status, label: String(status).replace(/_/g, ' '), tone: 'muted' };
  }
};

/** "19 Sept" this year, "19 Sept 2025" otherwise - Amazon drops the year it does not need. */
export const placedOn = (iso) => {
  const d = new Date(iso);
  const thisYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(thisYear ? {} : { year: 'numeric' }) });
};
