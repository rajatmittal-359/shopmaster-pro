const Payout = require('../models/Payout');
const Order = require('../models/Order');

/**
 * Money in versus money out, one line for the Saturday mail (plan 2.24).
 *
 * WHY
 *   Razorpay settles what customers paid into the platform's bank on its
 *   own schedule (T+2/T+3). Payouts are what the platform then transfers
 *   to sellers, by hand, with a bank reference. Nothing compared the two -
 *   a week where Razorpay settled ₹40,000 and the admin paid out ₹52,000
 *   would show on no screen. This reads both for the last 7 days and says
 *   the gap, plainly. Razorpay's settlements API needs the live key; when
 *   it cannot be read (test key, no network), the line says so instead of
 *   showing a zero that looks like a fact.
 *
 * @returns {Promise<{settled:number|null, settledCount:number, paidOut:number, paidOutCount:number, collectedOnline:number, cod:number, note:string|null}>}
 */
const weekSettlement = async ({ since = new Date(Date.now() - 7 * 24 * 3600 * 1000), fetchSettlements = defaultFetch } = {}) => {
  const [payouts, orders] = await Promise.all([
    Payout.find({ status: 'paid', paidAt: { $gte: since } }).select('netPayable amount').lean(),
    Order.find({ createdAt: { $gte: since }, paymentStatus: 'paid' }).select('totalAmount paymentMethod').lean(),
  ]);
  const paidOut = payouts.reduce((n, p) => n + Number(p.netPayable ?? p.amount ?? 0), 0);
  const collectedOnline = orders.filter((o) => o.paymentMethod !== 'cod').reduce((n, o) => n + Number(o.totalAmount || 0), 0);
  const cod = orders.filter((o) => o.paymentMethod === 'cod').reduce((n, o) => n + Number(o.totalAmount || 0), 0);

  let settled = null;
  let settledCount = 0;
  let note = null;
  try {
    const list = await fetchSettlements(since);
    settled = list.reduce((n, s) => n + Number(s.amount || 0) / 100, 0);
    settledCount = list.length;
  } catch (err) {
    note = `Razorpay settlements could not be read (${String(err?.message || err).slice(0, 60)})`;
  }
  return { settled, settledCount, paidOut, paidOutCount: payouts.length, collectedOnline, cod, note };
};

/** Razorpay: GET /v1/settlements?from=&to= (unix seconds). Test keys return none. */
async function defaultFetch(since) {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error('no Razorpay key');
  const from = Math.floor(since.getTime() / 1000);
  const to = Math.floor(Date.now() / 1000);
  const res = await fetch(`https://api.razorpay.com/v1/settlements?from=${from}&to=${to}&count=100`, {
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.description || `Razorpay said ${res.status}`);
  return Array.isArray(data.items) ? data.items : [];
}

/** The one sentence the digest prints. */
const settlementLine = (s) => {
  const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
  if (s.settled === null) return `Paid out to sellers ${money(s.paidOut)} (${s.paidOutCount}) · online sales ${money(s.collectedOnline)}, COD ${money(s.cod)} · ${s.note || 'settlements unknown'}`;
  const gap = s.settled - s.paidOut;
  return `Razorpay settled ${money(s.settled)} (${s.settledCount}) · paid out to sellers ${money(s.paidOut)} (${s.paidOutCount}) · ${gap >= 0 ? `${money(gap)} still with the platform` : `${money(-gap)} paid out beyond what settled - check`}`;
};

module.exports = { weekSettlement, settlementLine };
