/**
 * Reading what a courier wrote.
 *
 * These two live away from the components because both the order page and the
 * timeline need them, and a component file that also exports helpers costs
 * fast refresh - but the better reason is that they encode a judgement about
 * honesty that must be made in exactly one place. When it was inlined twice,
 * the headline and the timeline disagreed about whether a parcel had moved.
 */

/** Sentence case: couriers SHOUT, and a wall of capitals reads as noise. */
export const readable = (text) => {
  const t = String(text || '').trim();
  if (!t) return '';
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};

/**
 * Scans that mean the parcel is genuinely MOVING, not merely registered.
 *
 * The first thing a courier records is "Data Received" or "Pickup Generated" -
 * their system has the manifest. The parcel is still on the seller's shelf at
 * that point, sometimes for a day.
 *
 * Treating any scan as movement made this page announce "Out for delivery" over
 * a single "Data Received" line: the same over-promise as claiming a handover
 * that had not happened, wearing different words. A customer told their parcel
 * is minutes away, who then waits, stops believing the page - and the page is
 * the only thing they have.
 */
const MOVING = /picked|in\s*transit|out for delivery|reached|departed|arrived|bag|hub/i;

export const hasLeftTheSeller = (scans = []) =>
  scans.some((s) => MOVING.test(String(s.activity || '')));
