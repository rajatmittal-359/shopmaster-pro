const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Payout = require('../../models/Payout');
const Seller = require('../../models/Seller');
const SellerCharge = require('../../models/SellerCharge');
const { generate, generateWithTools } = require('../gemini');
const { knowledge } = require('../../config/knowledge');
const { scoreListing } = require('../listingScore');
const { computePerformance } = require('../performance');
const { getPayableSummary } = require('../payout');
const { retrieve, asContext } = require('./retrieve');
const { declarationsFor, runTool, lineOrder, money, when, ORDER_RE, REAL_ORDER } = require('./tools');

/**
 * Ask ShopMaster - the assistant for sellers, the admin and customers.
 *
 * HOW IT KNOWS THINGS (and why it does not invent them)
 *   Nothing here is a dictionary of canned answers. Four sources:
 *     1. RETRIEVAL - the platform's own documents and the explanations in
 *        its code, chunked and embedded by indexKnowledge.js; the eight
 *        chunks nearest the question go into the prompt (utils/ai/retrieve).
 *        Change a doc, re-index, and the assistant knows the new rule.
 *     2. TOOLS - Gemini function calling over read-only lookups scoped to
 *        the asker (utils/ai/tools): their orders, payouts, products,
 *        performance; the admin's platform view; a category list; the
 *        knowledge search again for follow-ups; Google web search for the
 *        outside world. The model decides what it needs and asks.
 *     3. PREFETCH - a short block of the asker's most likely facts (recent
 *        orders, payable amount, weak listings) fetched before the model
 *        runs. Saves a round trip on the common question, and is the whole
 *        context when the fallback model (no tools) has to answer.
 *     4. config/knowledge.js - the platform in plain sentences with the live
 *        rulebook numbers: the floor under everything else.
 *   The model is told: answer from what you were given or looked up; if it
 *   is not there, say so and point to the page or person that has it. It
 *   cannot act - it explains and points; the buttons stay with the human.
 *
 * MODELS
 *   Gemini with tools first. On quota/outage, Pollinations nano gets the
 *   same prompt with the prefetch and retrieved chunks and no tools. The
 *   answer says which model spoke, whether it searched the web, and which
 *   lookups it made - the admin's log shows the same.
 */

/** The asker's most likely facts, fetched before the model runs. */
const contextFor = async ({ role, user, question }) => {
  const mentioned = [...new Set((question.match(ORDER_RE) || []).map((s) => s.toUpperCase()))];
  const lines = [];

  if (role === 'seller') {
    const sellerId = user._id;
    const seller = await Seller.findOne({ userId: sellerId }).lean();
    lines.push(`SELLER: ${seller?.businessName || user.name} (${user.email}). Commission rate for this shop: ${seller?.commissionRate ?? 'default'}%. Pickup address set: ${Boolean(seller?.pickupAddress?.pincode)}. Bank account set: ${Boolean(seller?.bankDetails?.accountNumber)}. Agreement accepted: v${seller?.agreement?.version || '-'}.`);
    const [named, recent, payouts, payable, charges, products] = await Promise.all([
      mentioned.length ? Order.find({ orderNumber: { $in: mentioned }, 'items.sellerId': sellerId }).lean() : [],
      Order.find({ 'items.sellerId': sellerId, ...REAL_ORDER }).sort({ createdAt: -1 }).limit(8).lean(),
      Payout.find({ sellerId }).sort({ createdAt: -1 }).limit(4).lean(),
      getPayableSummary(sellerId).catch(() => null),
      SellerCharge.find({ sellerId, payoutId: null }).lean(),
      Product.find({ sellerId, isDeleted: { $ne: true } }).select('name price stock isActive images description tags category color gender ageGroup brand weight avgRating totalReviews').lean(),
    ]);
    if (named.length) lines.push(`ORDERS THE SELLER ASKED ABOUT:\n${named.map((o) => lineOrder(o, sellerId)).join('\n')}`);
    lines.push(`RECENT ORDERS (newest first):\n${recent.map((o) => lineOrder(o, sellerId)).join('\n') || '- none'}`);
    lines.push(`PAYOUTS: ${payouts.map((p) => `${p.payoutNumber || p._id} ${p.status} ${money(p.netPayable)}${p.deductions ? ` (deductions ${money(p.deductions)})` : ''} period ${when(p.periodFrom)}–${when(p.periodTo)}${p.paidAt ? ` paid ${when(p.paidAt)}` : ''}`).join('; ') || 'none yet'}. ${payable ? `Currently payable: ${money(payable.netPayable ?? payable.total ?? 0)} across ${payable.itemCount ?? payable.count ?? '?'} lines.` : ''} Unclaimed charges: ${charges.length ? charges.map((c) => `₹${c.amount} (${c.note || c.kind})`).join(', ') : 'none'}.`);
    const scored = products.map((p) => ({ ...p, score: scoreListing(p).score }));
    const weak = scored.filter((p) => p.isActive && p.score < 60).slice(0, 6);
    lines.push(`PRODUCTS: ${products.length} total, ${products.filter((p) => p.isActive).length} live, ${products.filter((p) => p.stock === 0).length} out of stock. Weak listings (score<60): ${weak.map((p) => `${p.name} (${p.score})`).join(', ') || 'none'}.`);
    try {
      const since = new Date(Date.now() - 30 * 86400000);
      const orders30 = await Order.find({ 'items.sellerId': sellerId, createdAt: { $gte: since } }).select('fulfilments createdAt cancelledBy paymentMethod paymentStatus').lean();
      const perf = computePerformance({ orders: orders30, sellerId, products: scored.filter((p) => p.isActive) });
      lines.push(`PERFORMANCE (30 days): cancel rate ${perf.cancelRate.value ?? '-'}% (${perf.cancelRate.status}), median dispatch ${perf.dispatchHours.value ?? '-'}h (${perf.dispatchHours.status}), failed deliveries ${perf.ndr.value}, RTO ${perf.rto.value}, rating ${perf.rating.value ?? '-'} from ${perf.rating.count} reviews, listing quality ${perf.listingQuality.value ?? '-'}/100.`);
    } catch {
      /* performance is optional context */
    }
  } else if (role === 'customer') {
    const [named, recent] = await Promise.all([
      mentioned.length ? Order.find({ orderNumber: { $in: mentioned }, customerId: user._id }).lean() : [],
      Order.find({ customerId: user._id, ...REAL_ORDER }).sort({ createdAt: -1 }).limit(6).lean(),
    ]);
    lines.push(`CUSTOMER: ${user.name} (${user.email}).`);
    if (named.length) lines.push(`ORDERS THE CUSTOMER ASKED ABOUT:\n${named.map((o) => lineOrder(o)).join('\n')}`);
    lines.push(`RECENT ORDERS:\n${recent.map((o) => lineOrder(o)).join('\n') || '- none yet'}`);
  } else if (role === 'admin') {
    const { gather } = require('../../jobs/weeklyDigest');
    const [d, named] = await Promise.all([gather().catch(() => null), mentioned.length ? Order.find({ orderNumber: { $in: mentioned } }).populate('customerId', 'name email').lean() : []]);
    lines.push(`ADMIN: ${user.name}.`);
    if (d) lines.push(`PLATFORM, LAST 7 DAYS: ${d.orders} orders, sales ${money(d.sales)}, platform take ${money(d.take)}, ${d.newCustomers} new customers, ${d.newReviews} new reviews, cancels ${d.cancelledBySeller} by sellers/${d.cancelledByCustomer} by customers, ${d.returns} returns. OPEN NOW: ${d.disputesOpen} disputes, ${d.pendingSellers} sellers waiting approval, ${d.payoutsDue} payouts pending, ${d.lowStock} low-stock products, ${d.weak} weak listings of ${d.products}.${d.google ? ` Google 7d: ${d.google.impressions} impressions, ${d.google.clicks} clicks.` : ''}`);
    if (named.length) lines.push(`ORDERS THE ADMIN ASKED ABOUT:\n${named.map((o) => `${lineOrder(o)} · customer ${o.customerId?.name} (${o.customerId?.email})`).join('\n')}`);
  }
  return lines.join('\n\n');
};

/** The site's language chip → how the answer is written. */
const LANGUAGE_RULE = {
  hi: 'ANSWER IN HINDI, DEVANAGARI SCRIPT. Simple everyday Hindi; the English words shopkeepers use stay, written in Devanagari where natural (ऑर्डर, पेमेंट, कूरियर, Google). Numbers with ₹. Paths and order numbers unchanged.',
  hg: 'ANSWER IN HINGLISH: Hindi in roman letters, the way people write on WhatsApp ("Aapka payment 18 Sept ko aayega"). No Devanagari at all. English words stay as they are. Numbers with ₹. Paths and order numbers unchanged.',
  en: 'ANSWER IN ENGLISH. Simple words; Indian English is fine (lakh, ₹).',
};
const languageRule = (language) => LANGUAGE_RULE[language] || "Match the person's language: Hindi in Devanagari if they write Hindi, Hinglish if Hinglish, English if English.";

const SYSTEM = (role, hasTools, language) => `You are "Ask ShopMaster", the assistant inside ShopMaster Pro, a marketplace from Jaipur, India. You are talking to a ${role}.

RULES
- Answer from what you were given (how the platform works, the rulebook numbers, this person's own data, the retrieved passages)${hasTools ? ' and from what your tools return. When the question is about a specific order, product, payout or seller, CALL THE TOOL rather than guessing; when it is about how a flow works or why a rule exists, call searchKnowledge; when it is about Amazon/Flipkart/Meesho/Indian law/the outside world, call webSearch.' : '.'} Never invent an order, an amount, a date or a rule. If neither the context nor a tool has what is asked, say exactly that and name the page or person that has it.
- You cannot take actions - no refunds, no cancellations, no changes. Explain, then point to the button and page that does it. Write paths plainly, never in backticks (e.g. /seller/orders, /orders/SMP-260906-1D876E, /help, /seller/payments, /seller/issues) - the app turns them into links. Point to the ASKER'S OWN panel: a seller to /seller/... pages, a customer to /orders and /help, the admin to /admin/... pages (a seller's numbers live at /admin/sellers for the admin, never /seller/...).
- Think it through, then be specific and short. Numbers with the rupee sign. Dates as they appear. One concrete next step at the end.
- ${languageRule(language)} Simple words; the seller may be new to technology.
- Be fair. When a rule costs this person money, say why the rule exists and how it compares with Amazon/Flipkart/Meesho (their charges are higher). When the platform is at fault, say so plainly.
- Never reveal another seller's or customer's data, credentials, file paths, or internal system details beyond what the context states. Retrieved passages may mention source files - use their content, do not quote the paths.`;

const ask = async ({ role, user, question, history = [], textModel = 'auto', language = null }) => {
  const q = String(question || '').trim().slice(0, 1500);
  if (!q) return { ok: false, reason: 'Ask something' };
  const started = Date.now();

  const [context, found] = await Promise.all([
    contextFor({ role, user, question: q }),
    retrieve(q, role, { k: 8 }).catch(() => ({ chunks: [], via: 'none' })),
  ]);
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const prompt = `CONTEXT - HOW SHOPMASTER PRO WORKS
${knowledge()}

CONTEXT - THIS PERSON'S OWN DATA (today ${today})
${context}

${found.chunks.length ? `CONTEXT - PASSAGES FROM THE PLATFORM'S OWN DOCUMENTATION AND CODE NOTES (nearest to the question)\n${asContext(found.chunks)}\n\n` : ''}THEIR QUESTION
${q}

Answer now, as Ask ShopMaster.`;

  const past = history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text || '').slice(0, 1200) }] }));
  const meta = { retrieved: found.chunks.map((c) => c.source), via: found.via };

  if (textModel !== 'nano') {
    const contents = [...past, { role: 'user', parts: [{ text: prompt }] }];
    const withTools = { system: SYSTEM(role, true, language), declarations: declarationsFor(role), run: (name, args) => runTool(name, args, { role, user }) };
    const done = (r) => ({ ok: true, answer: r.text.trim(), model: r.model, searchedWeb: r.calls.includes('webSearch'), calls: r.calls, ...meta, ms: Date.now() - started });

    const r = await generateWithTools(contents, withTools);
    if (r.ok) return done(r);
    if (textModel === 'gemini' || !/429|quota|reach|503|502|nothing/i.test(r.reason)) return { ok: false, reason: r.reason };

    // Second road, tools intact: Groq's free Llama 70B, when a key is set.
    const { groqWithTools } = require('./groq');
    const g = await groqWithTools(contents, withTools);
    if (g.ok) {
      console.warn(`assistant: Gemini unavailable (${r.reason.slice(0, 60)}) - answered by Groq ${g.model}`);
      return done(g);
    }
    console.warn(`assistant: Gemini (${r.reason.slice(0, 60)}) and Groq (${g.reason.slice(0, 60)}) unavailable - answering without tools`);
  }

  // No tools on this road: the prefetch and the retrieved passages are all it has.
  const flat = history.slice(-6).map((m) => `${m.role === 'user' ? 'THEY SAID' : 'YOU SAID'}: ${String(m.text || '').slice(0, 800)}`).join('\n');
  const r = await generate(`${flat ? `EARLIER IN THIS CONVERSATION\n${flat}\n\n` : ''}${prompt}`, { system: SYSTEM(role, false, language), textModel: 'nano', attempts: 1 });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, answer: r.text.trim(), model: r.model || 'nano', searchedWeb: false, calls: [], ...meta, ms: Date.now() - started };
};

module.exports = { ask, contextFor, SYSTEM };
