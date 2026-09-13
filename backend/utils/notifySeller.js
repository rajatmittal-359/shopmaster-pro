const Order = require('../models/Order');
const { frontendUrl } = require('./appUrl');
const { notify } = require('./notify');

/**
 * The seller's phone buzzes when something needs them.
 *
 * WHY (13 Sep 2026)
 *   The day-to-day operator of Charming Jewels is Rajat's mother, at home,
 *   on a phone; Rajat sees the panel on weekends. Until today a new order
 *   sat silently in the seller queue - the template existed and nothing
 *   sent it. An email to the seller's Gmail is the one notification that
 *   reaches a phone for free, needs no app, and is read the same minute.
 *
 * WHAT IS SENT (one short mail each, Hindi first, English under it)
 *   new order          what to pack, for whom, one button to the order
 *   return requested   what is coming back and why
 *   dispute opened     the 72-hour clock has started
 *
 * SINCE 14 Sep 2026 (plans 2.26, 2.30) every moment goes through
 * utils/notify: the bell row always, the phone push and the mail as the
 * seller's own preferences allow. Hindi first everywhere.
 *
 * Never throws - a bell, push or mail failure must not fail the order.
 */
// Customer-written text (names, reasons) is escaped before it enters HTML.
const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Subjects are headers: one line, no markup.
const plain = (v) => String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/&amp;/g, '&').replace(/&lt;|&gt;|&quot;|&#39;/g, '');
const panelUrl = (path) => `${frontendUrl()}/seller${path}`;

const shell = (title, lines, href, label) => `
  <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#111">
    <h2 style="margin:0 0 12px;font-size:20px">${title}</h2>
    ${lines.map((l) => `<p style="margin:0 0 8px;font-size:15px;line-height:1.5">${l}</p>`).join('')}
    <p style="margin:20px 0"><a href="${href}" style="display:inline-block;background:#4f3ab8;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:600">${label}</a></p>
    <p style="font-size:12px;color:#666">ShopMaster Pro · seller panel</p>
  </div>`;

const itemsOf = (order, sellerId) =>
  (order.items || [])
    .filter((i) => String(i.sellerId) === String(sellerId))
    .map((i) => `${esc(i.name)}${i.quantity > 1 ? ` × ${Number(i.quantity)}` : ''}`)
    .join(', ');

const sellerIdsOf = (order) => [...new Set((order.items || []).map((i) => String(i.sellerId)))];

/** One event → bell + push + mail, per the seller's preferences. Never throws. */
const tell = async (sellerId, { category, title, body, url, tag, subject, html, text }) => {
  try {
    await notify({ userId: sellerId, role: 'seller', category, title, body, url, tag, mail: { subject, html, text } });
  } catch (err) {
    console.error(`Seller notification (${subject}) failed:`, err.message);
  }
};

/** A paid (or COD) order: every seller in it is told about their own lines. */
const newOrder = async (orderId) => {
  const order = await Order.findById(orderId).populate('customerId', 'name').lean().catch(() => null);
  if (!order) return;
  for (const sellerId of sellerIdsOf(order)) {
    const what = itemsOf(order, sellerId);
    const cod = order.paymentMethod === 'cod';
    const subject = plain(`नया ऑर्डर · New order ${order.orderNumber} - ${what}`);
    const href = panelUrl(`/orders/${order._id}`);
    const html = shell(
      'नया ऑर्डर आया है 🎉',
      [
        `<b>${what}</b>`,
        `${esc(order.customerId?.name || 'Customer')} · ${cod ? 'Cash on delivery' : 'Paid online'}`,
        'पैक करके ऑर्डर पेज पर <b>Book courier</b> दबाएँ - राइडर आकर ले जाएगा। 2 दिन के अंदर भेजना है।',
        `Pack it and press <b>Book courier</b> on the order page - the rider collects. Dispatch within 2 working days.`,
      ],
      href,
      'ऑर्डर खोलें · Open the order'
    );
    await tell(sellerId, { category: 'orders', title: 'नया ऑर्डर आया है 🎉', body: `${plain(what)} · ${plain(order.customerId?.name || 'Customer')} · ${cod ? 'COD' : 'Paid'}`, url: `/seller/orders/${order._id}`, tag: `order-${order._id}`, subject, html, text: `New order ${order.orderNumber}: ${what}. Open: ${href}` });
  }
};

const returnRequested = async (orderId, sellerId) => {
  const order = await Order.findById(orderId).lean().catch(() => null);
  if (!order) return;
  const f = (order.fulfilments || []).find((x) => String(x.sellerId) === String(sellerId)) || {};
  const what = itemsOf(order, sellerId);
  const href = panelUrl(`/orders/${order._id}`);
  const html = shell(
    'ग्राहक ने वापसी माँगी है · Return requested',
    [
      `<b>${what}</b> · ${order.orderNumber}`,
      `कारण / reason: ${esc(f.returnReason || '-')}${f.returnResolution === 'replacement' ? ' · exchange (same item again)' : ' · refund'}`,
      'अभी कुछ नहीं करना - पिकअप बुक हो रहा है। सामान पहुँचे तब ऑर्डर पेज से settle करें।',
      'Nothing to do yet - the pickup is being booked. When it reaches you, settle it from the order page.',
    ],
    href,
    'ऑर्डर देखें · See the order'
  );
  await tell(sellerId, { category: 'returns', title: 'वापसी माँगी है · Return requested', body: `${plain(what)} · ${plain(f.returnReason || '')}`.slice(0, 200), url: `/seller/orders/${order._id}`, tag: `return-${order._id}-${sellerId}`, subject: plain(`वापसी · Return requested ${order.orderNumber} - ${what}`), html, text: `Return requested on ${order.orderNumber}: ${what}. ${href}` });
};

const disputeOpened = async (orderId) => {
  const order = await Order.findById(orderId).lean().catch(() => null);
  if (!order) return;
  for (const f of order.fulfilments || []) {
    if (f.disputeStatus !== 'open') continue;
    const what = itemsOf(order, f.sellerId);
    const href = panelUrl(`/orders/${order._id}`);
    const html = shell(
      'शिकायत आई है · A dispute is open',
      [
        `<b>${what}</b> · ${order.orderNumber}`,
        `ग्राहक कहता है / customer says: “${esc(f.disputeReason || '-')}”`,
        '<b>72 घंटे</b> में अपनी बात और सबूत (कूरियर का प्रूफ, फोटो) ऑर्डर पेज पर जोड़ें। फैसला एडमिन करेगा।',
        'Add your side and evidence (courier proof, photos) on the order page within <b>72 hours</b>. An admin decides.',
      ],
      href,
      'जवाब दें · Reply now'
    );
    await tell(f.sellerId, { category: 'disputes', title: 'शिकायत · Dispute - 72 घंटे', body: `${plain(what)} · “${plain(f.disputeReason || '')}”`.slice(0, 200), url: `/seller/orders/${order._id}`, tag: `dispute-${order._id}-${f.sellerId}`, subject: plain(`शिकायत · Dispute on ${order.orderNumber} - ${what}`), html, text: `Dispute opened on ${order.orderNumber}: ${what}. Reply within 72h: ${href}` });
  }
};

module.exports = { newOrder, returnRequested, disputeOpened };
