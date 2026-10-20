/**
 * The one line under a seller's order that says what its payout will do.
 *
 * WHY (20 Oct 2026, found filming the launch film)
 *   Both order views printed any `releasesAt` as "Payout released on <date>":
 *   past tense for a date still ahead, and the same words under an open
 *   dispute whose card said the money was held. The server already knew the
 *   difference - sellerPayoutStateFor returns blocked / holding / ready - so
 *   the line now reads the state, and the two views share it.
 *
 * @param payout   order.payout from the seller order API
 * @param t        the i18n function
 * @param when     date formatter
 * @returns {string|null} null when nothing is owed
 */
export function payoutLine(payout, t, when) {
  if (!payout || payout.state === 'nothing_owed') return null;
  switch (payout.state) {
    case 'paid':
      return t('Paid out');
    case 'blocked':
      return t('Payout on hold - {reason}', { reason: t(payout.blockedReason || 'Waiting on this order.') });
    case 'holding':
      return t('Payout releases on {date}', { date: when(payout.releasesAt) });
    case 'ready':
      return t('Payout cleared on {date} - it goes in the next payout', { date: when(payout.releasesAt) });
    case 'awaiting_delivery':
      return t('Paid out {n} days after delivery - the return window has to close first', { n: payout.returnWindowDays });
    default:
      return t('Payout: {state}', { state: t(String(payout.state).replace(/_/g, ' ')) });
  }
}
