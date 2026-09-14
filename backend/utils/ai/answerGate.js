const Order = require('../../models/Order');

/**
 * The answer gate (15 Sep 2026 - Rajat: "kuch AI bekaar, irrelevant output
 * dete hain, aisa na ho").
 *
 * WHY
 *   Models are not trained by us; what we control is the prompt, the
 *   evidence, the order of the roads - and whether a weak answer reaches
 *   the person. The eval graders (evalAssistant.js) already know what a bad
 *   answer looks like; this runs the same checks LIVE, on every road, and
 *   adds the one check only the database can make: an order number the
 *   model wrote must exist and belong to this person. A gate failure sends
 *   the question to the next road; on the last road the answer is repaired
 *   mechanically (no extra model call) rather than returned as is.
 *
 * TWO KINDS OF PROBLEM (15 Sep 2026, Rajat: "scope kam na ho jaaye")
 *   substance  - the answer cannot be trusted: an order number that is not
 *                this person's, a refusal while tools were available, an
 *                empty answer. These send the question to the NEXT ROAD.
 *   cosmetic   - the answer is right but dressed wrong: filler sentences,
 *                markdown, over 400 words. These are cleaned IN PLACE and
 *                the model's thinking is kept - a good long answer from the
 *                best model is never thrown away for a weaker model's short one.
 */
const ORDER_RE = /\bSMP-\d{6}-[A-Z0-9]{6}\b/gi;
const FILLER = /happy selling|let me know if|feel free|i hope this helps|hope that helps|as an ai|as a language model|great question|certainly!|sure!|😊|🙂|👍|🎉/i;
const REFUSAL = /\b(i|we) (do not|don't) have (access|the ability|information)|cannot (help|assist) with that|no access to (your|the) (order|account)/i;
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

const orderScope = (role, user) => (role === 'seller' ? { 'items.sellerId': user._id } : role === 'customer' ? { customerId: user._id } : {});

/**
 * @returns {Promise<{problems:string[], invented:string[]}>}
 */
const judge = async (answer, { role, user, hadTools = true } = {}) => {
  const problems = []; // substance - re-route
  const cosmetic = []; // dressing - clean in place
  const text = String(answer || '');
  const n = words(text);
  if (n < 2) problems.push('empty');
  if (n > 400) cosmetic.push(`too long (${n} words)`);
  if (FILLER.test(text)) cosmetic.push(`filler "${text.match(FILLER)[0]}"`);
  if (/^#{1,6}\s/m.test(text) || /```/.test(text)) cosmetic.push('markdown');
  if (hadTools && REFUSAL.test(text)) problems.push('refusal while tools exist');

  let invented = [];
  const codes = [...new Set((text.match(ORDER_RE) || []).map((c) => c.toUpperCase()))].slice(0, 12);
  if (codes.length && user?._id) {
    try {
      const found = await Order.find({ orderNumber: { $in: codes }, ...orderScope(role, user) }).select('orderNumber').lean();
      const have = new Set(found.map((o) => o.orderNumber));
      invented = codes.filter((c) => !have.has(c));
      if (invented.length) problems.push(`invented order ${invented.join(', ')}`);
    } catch {
      /* the database being away is not the model's fault */
    }
  }
  return { problems, cosmetic, invented };
};

/** Mechanical repair for the last road: strip what can be stripped, name what cannot be trusted. */
const repair = (answer, { invented = [] } = {}) => {
  let text = String(answer || '');
  text = text.replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s+/gm, '');
  // Drop whole sentences that are filler.
  text = text
    .split(/(?<=[.!?।])\s+/)
    .filter((s) => !FILLER.test(s))
    .join(' ');
  for (const code of invented) text = text.split(new RegExp(code, 'ig')).join('(order number not on record - see /orders)');
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (words(text) > 400) text = `${text.split(/\s+/).slice(0, 380).join(' ')}…`;
  return text;
};

module.exports = { judge, repair, FILLER, REFUSAL, words };
