const Order = require('../../models/Order');
const Seller = require('../../models/Seller');
const RULES = require('../../config/sellerRules');
const { generate } = require('../gemini');
const { customerRisk, sellerRisk } = require('../risk');
const { receiptVerdict, KIND_LABEL } = require('../returnPolicy');

/**
 * The admin decision agent (plan 2.19).
 *
 * WHAT IT IS
 *   For one open dispute: everything each side has shown, laid side by side,
 *   what the rulebook says about exactly this situation, and a recommendation
 *   with a confidence - drafted so the admin can decide in a minute on a
 *   Saturday morning instead of reading four screens. The admin decides.
 *   The brief is kept on the fulfilment so the log shows what was advised.
 *
 * WHAT IT IS NOT
 *   It does not move money and cannot. resolveDispute is a human's button.
 *
 * HOW IT DECIDES WHAT TO SAY
 *   Evidence first, in this order: courier scans and proof of delivery (the
 *   only party with no stake), the seller's pack proof, the customer's photos
 *   at the request, the pickup, the seller's receipt photos, then each side's
 *   180-day record. The rulebook (utils/returnPolicy) is applied to the
 *   facts before the model sees them - the model explains and weighs, it
 *   does not invent rules. Where evidence is missing on both sides it says
 *   so and recommends 'need_more' or the goodwill route, never a coin toss.
 */
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Two sentences: what is claimed and what the evidence shows.' },
    forCustomer: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Facts that support the customer, each one line.' },
    forSeller: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Facts that support the seller, each one line.' },
    missing: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Evidence that would settle it and is not there.' },
    recommendation: { type: 'STRING', enum: ['customer', 'seller', 'partial', 'need_more'] },
    confidence: { type: 'NUMBER', description: '0 to 1' },
    reasoning: { type: 'STRING', description: 'Why, against the rulebook, in under 80 words.' },
    resolutionNote: { type: 'STRING', description: 'The note the admin could write on the order for both sides, one or two sentences, plain and fair.' },
  },
  required: ['summary', 'forCustomer', 'forSeller', 'missing', 'recommendation', 'confidence', 'reasoning', 'resolutionNote'],
};

/** Everything known about this parcel's dispute, as facts. */
const gatherEvidence = async (order, sellerId) => {
  const f = (order.fulfilments || []).find((x) => String(x.sellerId) === String(sellerId));
  if (!f) return null;
  const items = (order.items || []).filter((i) => String(i.sellerId) === String(sellerId));
  const amount = items.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
  const [seller, cRisk, sRisk] = await Promise.all([
    Seller.findOne({ userId: sellerId }).select('businessName createdAt').lean(),
    customerRisk(order.customerId?._id || order.customerId),
    sellerRisk(sellerId),
  ]);
  const verdict = f.receiptCheck?.ok === false || f.receiptCheck?.ok === true
    ? receiptVerdict({ sellerOk: f.receiptCheck.ok, sellerPhotos: (f.receiptCheck.photos || []).length, customerEvidence: (f.returnEvidence || []).length, packProof: Boolean(f.packProof?.url), amount, goodwillUsedRecently: cRisk.goodwill > 0 })
    : null;
  return {
    order: { number: order.orderNumber, placed: when(order.createdAt), payment: `${order.paymentMethod} ${order.paymentStatus}`, amount, items: items.map((i) => `${i.name} ×${i.quantity} @${money(i.price)}`) },
    parcel: { status: f.status, shippedAt: when(f.shippedAt), deliveredAt: when(f.deliveredAt), deliveryConfirmedBy: f.deliveryConfirmedBy, courier: f.courierName, awb: f.awb, courierLastWord: f.courierStatus, podUrl: f.podUrl || null, ndrAttempts: f.ndrAttempts || 0, ndrReason: f.ndrReason },
    packProof: f.packProof?.url ? { url: f.packProof.url, at: when(f.packProof.at) } : null,
    returnRequest: f.returnStage ? { stage: f.returnStage, kind: f.returnKind, kindLabel: KIND_LABEL[f.returnKind] || f.returnKind, reason: f.returnReason, requestedAt: when(f.returnRequestedAt), hoursAfterDelivery: f.deliveredAt && f.returnRequestedAt ? Math.round((new Date(f.returnRequestedAt) - new Date(f.deliveredAt)) / 3600000) : null, evidence: f.returnEvidence || [], tagIntact: f.returnTagIntact, resolution: f.returnResolution, pickupAwb: f.returnAwb } : null,
    receiptCheck: f.receiptCheck?.at ? { ok: f.receiptCheck.ok, photos: f.receiptCheck.photos || [], note: f.receiptCheck.note, at: when(f.receiptCheck.at), hoursAfterPickup: null } : null,
    dispute: { status: f.disputeStatus, raisedBy: f.disputeRaisedBy || 'customer', reason: f.disputeReason, raisedAt: when(f.disputeRaisedAt), sellerNote: f.disputeSellerNote, sellerEvidence: f.disputeSellerEvidence || [], sellerRespondedAt: when(f.disputeSellerRespondedAt), sellerHoursLeft: f.disputeRaisedAt && !f.disputeSellerRespondedAt ? Math.max(0, Math.round(RULES.disputeResponseHours - (Date.now() - new Date(f.disputeRaisedAt)) / 3600000)) : null },
    customer: { name: order.customerId?.name || null, record: cRisk },
    seller: { name: seller?.businessName || null, since: when(seller?.createdAt), record: sRisk },
    rulebook: {
      returnWindowDays: RULES.returnWindowDays, damagedClaimHours: RULES.damagedClaimHours, receiptCheckHours: RULES.receiptCheckHours, disputeResponseHours: RULES.disputeResponseHours,
      goodwillCapRupees: RULES.goodwillCapRupees, otpDeliveryAbove: RULES.otpDeliveryAbove, unboxingVideoAbove: RULES.unboxingVideoAbove, adminReviewAbove: RULES.adminReviewAbove,
      receiptVerdict: verdict,
    },
  };
};

/**
 * The evidence as plain facts, before the JSON. A first draft on a real
 * dispute had proof of delivery in the JSON and the model wrote "no POD" -
 * a fact stated in a sentence is read; a URL in a nested object is skimmed.
 */
const FACTS = (ev) => {
  const lines = [];
  const p = ev.parcel;
  lines.push(`Parcel: ${p.status}; shipped ${p.shippedAt}; delivered ${p.deliveredAt} by ${p.courier || 'courier'} (AWB ${p.awb || '-'}); courier's last word "${p.courierLastWord || '-'}".`);
  lines.push(p.podUrl ? `PROOF OF DELIVERY: PRESENT - the courier recorded a delivery photo/signature (${p.podUrl}).` : 'PROOF OF DELIVERY: NONE on record.');
  lines.push(p.deliveryConfirmedBy ? `Delivery confirmed by: ${p.deliveryConfirmedBy}.` : 'Delivery confirmed by: nobody yet (courier scan only).');
  if (p.ndrAttempts) lines.push(`Failed delivery attempts before: ${p.ndrAttempts} (${p.ndrReason || ''}).`);
  lines.push(ev.packProof ? `SELLER PACK PROOF: PRESENT, taken ${ev.packProof.at} (${ev.packProof.url}).` : 'SELLER PACK PROOF: NONE.');
  if (ev.returnRequest) {
    const r = ev.returnRequest;
    lines.push(`Return request: "${r.kindLabel || r.kind || 'unspecified'}" - ${r.reason || ''}; raised ${r.requestedAt}${r.hoursAfterDelivery != null ? ` (${r.hoursAfterDelivery} h after delivery)` : ''}; customer photos: ${r.evidence.length}; tag intact confirmed: ${r.tagIntact === true ? 'yes' : r.tagIntact === false ? 'no' : 'n/a'}; asked for ${r.resolution || 'refund'}.`);
  }
  if (ev.receiptCheck) lines.push(`Seller receipt check: ${ev.receiptCheck.ok ? 'OK' : 'NOT OK'} - "${ev.receiptCheck.note || ''}" with ${ev.receiptCheck.photos.length} photo(s), ${ev.receiptCheck.at}.`);
  const d = ev.dispute;
  lines.push(`Dispute raised by the ${d.raisedBy} on ${d.raisedAt}: "${d.reason || ''}".`);
  lines.push(d.sellerRespondedAt && d.sellerRespondedAt !== '-' ? `Seller responded ${d.sellerRespondedAt}: "${d.sellerNote || ''}" with ${d.sellerEvidence.length} photo(s).` : `Seller has NOT responded yet${d.sellerHoursLeft != null ? ` - ${d.sellerHoursLeft} h left of ${ev.rulebook.disputeResponseHours}` : ''}.`);
  lines.push(`Amount at stake: ₹${ev.order.amount.toLocaleString('en-IN')}; paid ${ev.order.payment}.`);
  lines.push(`Customer's 180-day record: ${ev.customer.record.orders} orders, ${ev.customer.record.returns} returns, ${ev.customer.record.disputes} disputes (${ev.customer.record.disputesLost} lost), ${ev.customer.record.rto} undelivered; signals: ${ev.customer.record.signals.join('; ') || 'none'}.`);
  lines.push(`Seller's 180-day record: ${ev.seller.record.shipped} parcels, pack proof on ${ev.seller.record.packProofRate ?? '-'}%, ${ev.seller.record.disputes} disputes (${ev.seller.record.disputesLost} lost); signals: ${ev.seller.record.signals.join('; ') || 'none'}.`);
  if (ev.rulebook.receiptVerdict) lines.push(`Rulebook on the receipt check: ${ev.rulebook.receiptVerdict.outcome} - ${ev.rulebook.receiptVerdict.reason}`);
  return lines.map((l) => `- ${l}`).join('\n');
};

const PROMPT = (ev) => `You are the decision assistant for the admin of ShopMaster Pro, a marketplace in Jaipur. One dispute, all the evidence, the rulebook. Write a brief the admin can act on in a minute. Be fair to both sides; the customer is not always right and neither is the seller. Evidence outranks words: courier scans and proof of delivery first, then the seller's pack proof, then the customer's photos, then the seller's receipt photos, then each side's record. Never invent a fact. If the deciding evidence is missing, say what it is and recommend need_more (or the goodwill route when the rulebook's receiptVerdict says so).

RULEBOOK
- Wrong, damaged, defective or not-as-described is always the customer's right; change of mind only inside the item's mode, with the tag on.
- A "damaged / wrong / defective" claim must be raised within ${ev.rulebook.damagedClaimHours} h of delivery with photos. A wrong/missing/empty-box claim at ₹${ev.rulebook.unboxingVideoAbove}+ needs unboxing evidence.
- The seller must respond to a dispute within ${ev.rulebook.disputeResponseHours} h; a return that came back must be checked within ${ev.rulebook.receiptCheckHours} h WITH photos - a refusal without photos does not count.
- Below ₹${ev.rulebook.goodwillCapRupees} with no evidence either way: refund as goodwill once per customer per 90 days.
- "Delivered but not received": courier POD / OTP decides; without POD the benefit of the doubt is the customer's (Indian consumer forums rule the same way).
- Partial: possible when both are partly right (e.g. item fine but late; minor damage) - say the split.
- If the seller has not responded within ${ev.rulebook.disputeResponseHours} h, the platform decides on the customer's evidence alone; before that deadline, say how long the seller still has.

FACTS (read these first; they are the same data as the JSON below)
${FACTS(ev)}

EVIDENCE (JSON)
${JSON.stringify(ev, null, 1)}

Answer as JSON per the schema. recommendation: 'customer' (refund / replace), 'seller' (claim refused, sale stands), 'partial', or 'need_more'.`;

/**
 * @returns {Promise<{ok:true, brief:object, evidence:object, model:string}|{ok:false, reason:string}>}
 */
const briefDispute = async (orderId, sellerId) => {
  const order = await Order.findById(orderId).populate('customerId', 'name email').lean();
  if (!order) return { ok: false, reason: 'Order not found' };
  const evidence = await gatherEvidence(order, sellerId);
  if (!evidence) return { ok: false, reason: 'No parcel for that seller on this order' };
  if (!evidence.dispute.status && !evidence.returnRequest) return { ok: false, reason: 'Nothing is in dispute on this parcel' };

  /*
   * Roads, best first: Gemini (schema-enforced JSON), then Groq gpt-oss-120b
   * asked for JSON (the strongest free reasoner behind it), then nano. A
   * ruling on someone's money deserves the best model of the day, not the
   * fastest.
   */
  const prompt = PROMPT(evidence);
  let r = await generate(prompt, { responseSchema: SCHEMA, temperature: 0.2, attempts: 2, textModel: 'gemini' });
  if (!r.ok) {
    const { groqPlain } = require('./groq');
    const g = await groqPlain([{ role: 'user', parts: [{ text: `${prompt}\n\nOutput ONLY a JSON object with keys: summary, forCustomer, forSeller, missing, recommendation, confidence, reasoning, resolutionNote.` }] }], { model: 'openai/gpt-oss-120b', temperature: 0.2 });
    if (g.ok) r = { ok: true, text: g.text, model: g.model };
  }
  if (!r.ok) r = await generate(prompt, { responseSchema: SCHEMA, temperature: 0.2, attempts: 1, textModel: 'nano' });
  if (!r.ok) return { ok: false, reason: r.reason, evidence };
  let brief;
  try {
    const m = String(r.text).match(/\{[\s\S]*\}/);
    brief = JSON.parse(m ? m[0] : r.text);
  } catch {
    return { ok: false, reason: 'The model did not return a usable brief', evidence };
  }
  brief.recommendation = ['customer', 'seller', 'partial', 'need_more'].includes(brief.recommendation) ? brief.recommendation : 'need_more';
  brief.confidence = Math.max(0, Math.min(1, Number(brief.confidence) || 0));
  return { ok: true, brief, evidence, model: r.model || (r.fellBack ? 'nano' : 'gemini') };
};

module.exports = { briefDispute, gatherEvidence, PROMPT, SCHEMA };
