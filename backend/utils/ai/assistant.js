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
const { detectScript, rewriteScript } = require('./hinglish');

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
 * MODELS - four roads, in order, all free
 *   1. Gemini 3.5 flash, tools, full prompt (best; ~1,500 requests/day)
 *   2. Groq gpt-oss-120b, tools, compact prompt (8k tokens/MINUTE - one
 *      question per minute at full size, so the prompt is cut to fit)
 *   3. Groq compound-mini, no custom tools, full prompt (70k/minute, its own
 *      web search) - the road that holds when the two above are busy
 *   4. Pollinations nano, compact prompt, no tools
 *   The answer says which model spoke, whether it searched the web, and
 *   which lookups it made - the admin's log shows the same. Whatever the
 *   road, the answer's script is checked and fixed on the way out.
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
    // A shop named in the question gets its own block, so the roads without
    // tools (compound, nano) do not pass the platform's digest off as the shop's.
    const sellers = await Seller.find({}).select('businessName status isApproved commissionRate userId pickupAddress bankDetails').lean();
    const ql = question.toLowerCase();
    const hit = sellers.find((sl) => sl.businessName && ql.includes(String(sl.businessName).toLowerCase()));
    if (hit) {
      try {
        const since = new Date(Date.now() - 30 * 86400000);
        const [orders, products] = await Promise.all([
          Order.find({ 'items.sellerId': hit.userId, createdAt: { $gte: since } }).select('fulfilments createdAt cancelledBy paymentMethod paymentStatus items').lean(),
          Product.find({ sellerId: hit.userId, isDeleted: { $ne: true } }).lean(),
        ]);
        const live = products.filter((p) => p.isActive);
        const perf = computePerformance({ orders, sellerId: hit.userId, products: live.map((p) => ({ ...p, score: scoreListing(p).score })) });
        lines.push(`THE SHOP THE ADMIN ASKED ABOUT - ${hit.businessName}: status ${hit.status}, approved ${hit.isApproved}, commission ${hit.commissionRate}%, pickup set ${Boolean(hit.pickupAddress?.pincode)}, bank set ${Boolean(hit.bankDetails?.accountNumber)}. Last 30 days: ${perf.orders} orders, cancel rate ${perf.cancelRate.value ?? '-'}% (${perf.cancelRate.status}), median dispatch ${perf.dispatchHours.value ?? '-'}h (${perf.dispatchHours.status}), failed deliveries ${perf.ndr.value}, RTO ${perf.rto.value}, rating ${perf.rating.value ?? '-'} from ${perf.rating.count} reviews, listing quality ${perf.listingQuality.value ?? '-'}/100 across ${live.length} live products. (The PLATFORM line above is the whole marketplace, not this shop.)`);
      } catch {
        /* the tool road still has findSeller */
      }
    }
  }
  return lines.join('\n\n');
};

/** The site's language chip → how the answer is written. */
const LANGUAGE_RULE = {
  hi: 'ANSWER IN HINDI, DEVANAGARI SCRIPT. Simple everyday Hindi; the English words shopkeepers use stay, written in Devanagari where natural (ऑर्डर, पेमेंट, कूरियर, Google). Numbers with ₹. Paths and order numbers unchanged.',
  hg: 'ANSWER IN HINGLISH (whatever language earlier messages used): Hindi in roman letters, the way people write on WhatsApp ("Aapka payment 18 Sept ko aayega"). No Devanagari at all. English words stay as they are. Numbers with ₹. Paths and order numbers unchanged.',
  // Rajat (13 Sep): the English chip is not a wall - "kaise ho" gets a Hinglish
  // answer, "how are you" gets an English one. Only हिंदी and Hinglish pin the script.
  en: 'ANSWER IN ENGLISH - the LAST message was written in English, whatever language earlier messages used. Simple words; Indian English is fine (lakh, ₹).',
};
const languageRule = (language) => LANGUAGE_RULE[language] || "Match the person's language: Hindi in Devanagari if they write Hindi, Hinglish if Hinglish, English if English.";

const SYSTEM = (role, hasTools, language, user = null) => `You are "Ask ShopMaster", the assistant inside ShopMaster Pro, a marketplace from Jaipur, India. You are talking to a ${role}.${role === 'seller' && user?.sellerStatus === 'suspended' ? `
THIS SELLER IS SUSPENDED${user.suspendedReason ? ` (reason on file: "${user.suspendedReason}")` : ''}. They cannot list, edit or ship. Answer only about: their open orders and returns (which must still be honoured), what the rule they broke says and why it exists, and how to come back - write to Help (/seller/help) with what changed. No growth or listing advice while suspended; say so kindly and once.` : ''}

RULES
- Answer from what you were given (how the platform works, the rulebook numbers, this person's own data, the retrieved passages). THIS PERSON'S OWN DATA is the current state - for "what is waiting / open / needs my decision / kab aayega", answer from it. The BACKGROUND PASSAGES explain how things work and why; they are planning notes and documentation, never a to-do list and never the current state of an order or the platform${hasTools ? ' and from what your tools return. When the question is about a specific order, product, payout or seller, CALL THE TOOL rather than guessing; when it is about how a flow works or why a rule exists, call searchKnowledge; when it is about Amazon/Flipkart/Meesho/Indian law/the outside world, call webSearch; when it is about what a product like theirs sells for elsewhere, what price to set, which words buyers search, or what is trending, call marketBrief FIRST (the cached facts of the week, with sources) and webSearch only for what it lacks; answer from what they return (a price band with the sites it came from, the words as buyers write them) - you hold NO market or price data of your own and must never say you do; when a coupon code is named, call checkCoupon before saying anything about it; when a customer asks about a refund or a payment, call myPayments.' : '.'} Never invent an order, an amount, a date or a rule. If neither the context nor a tool has what is asked, say exactly that and name the page or person that has it.
- You cannot take actions - no refunds, no cancellations, no changes. Explain, then point to the button and page that does it. Write paths plainly, never in backticks (e.g. /seller/orders, /orders/SMP-260906-1D876E, /help, /seller/payments, /seller/issues) - the app turns them into links. Point to the ASKER'S OWN panel: a seller to /seller/... pages, a customer to /orders and /help, the admin to /admin/... pages (a seller's numbers live at /admin/sellers for the admin, never /seller/...).
- SHAPE OF AN ANSWER (Rajat, 13 Sep: "pinpointed, no faltu baat, wholesome"): the first line IS the answer - the number, the date, the yes/no. Then only what that answer needs: the specific order codes, amounts, dates, the reason. End with ONE concrete next step (page + button) when there is something to do; none when there is not. Under 120 words unless a list of real items is needed. No greeting, no emoji, no "Happy selling", no restating the question, no tour of the dashboard unless asked, no "let me know if". Small talk ("kaise ho", "how are you") gets ONE short warm line (under 25 words) naming, in words, what you can help with - no page paths, no order numbers, no lists, no questions back.
- Numbers with the rupee sign. Dates as they appear.
- ${languageRule(language)} Simple words; the seller may be new to technology.
- Be fair. When a rule costs this person money, say why the rule exists and how it compares with Amazon/Flipkart/Meesho (their charges are higher). When the platform is at fault, say so plainly.
- SCOPE: you are ShopMaster's assistant, not a general one. If the message is unrelated to ShopMaster, selling, buying, orders, money, rules, Google visibility or how other Indian marketplaces handle the same thing (a poem, a cricket score, homework, another company's support), reply with ONE line in their language: that you are the ShopMaster assistant and the three things you can help with. No answer to the unrelated question.
- Never reveal another seller's or customer's data, credentials, file paths, or internal system details beyond what the context states. Retrieved passages may mention source files - use their content, do not quote the paths.`;

const ask = async ({ role, user, question, history = [], textModel = 'auto', language: chip = null }) => {
  const q = String(question || '').trim().slice(0, 1500);
  if (!q) return { ok: false, reason: 'Ask something' };
  const started = Date.now();
  // हिंदी and Hinglish chips pin the script; English (or no chip) follows
  // what the person wrote. That is the effective language for the prompt AND
  // for the check on the way out.
  const language = chip === 'hi' || chip === 'hg' ? chip : detectScript(q);

  /* The model is told the script; the code makes sure of it. The answer's
     script is read the way the question's was and rewritten (one fast call)
     when it is not the one due - a model that drifted with the history, or a
     backup model that ignored the rule. */
  const inScript = async (answer) => (detectScript(answer) === language ? answer : rewriteScript(answer, language, { maxTokens: 1500 }));

  const [context, found] = await Promise.all([
    contextFor({ role, user, question: q }),
    retrieve(q, role, { k: 8 }).catch(() => ({ chunks: [], via: 'none' })),
  ]);
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  /*
   * Two sizes of the same prompt. Full (~6.5k tokens) for Gemini, whose free
   * tier allows it. Compact (~3.5k) for the roads with an 8,000-tokens-per-
   * MINUTE ceiling (every Groq chat model on the free tier, measured 13 Sep):
   * the four nearest passages cut to 700 chars, the prefetch to 2,500. The
   * rulebook floor stays whole - it is what keeps answers honest.
   */
  const buildPrompt = ({ compact }) => {
    const chunks = compact ? found.chunks.slice(0, 4).map((c) => ({ ...c, text: c.text.slice(0, 700) })) : found.chunks;
    const own = compact ? context.slice(0, 2500) : context;
    return `CONTEXT - HOW SHOPMASTER PRO WORKS
${knowledge()}

CONTEXT - THIS PERSON'S OWN DATA (today ${today})
${own}

${chunks.length ? `BACKGROUND PASSAGES - how the platform works and why (documentation and code notes nearest to the question; NOT the current state, NOT a to-do list)\n${asContext(chunks)}\n\n` : ''}THEIR QUESTION
${q}

Before you answer, check three things: (1) the first line is the answer itself - the number, the date, the yes/no; (2) every rule you cite carries its number exactly as given (hours, days, rupees); (3) if there is something for them to do, the last line is the page path that does it - otherwise no path. Answer now, as Ask ShopMaster.`;
  };

  const turns = (limit) => history.slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: String(m.text || '').slice(0, limit) }] }));
  const meta = { retrieved: found.chunks.map((c) => c.source), via: found.via };
  const failures = [];
  const done = async (r, extra = {}) => ({ ok: true, answer: await inScript(r.text.trim()), language, model: r.model, searchedWeb: Boolean(r.calls?.includes('webSearch')) || Boolean(extra.searchedWeb), calls: r.calls || [], ...meta, ms: Date.now() - started });
  /*
   * The answer gate (utils/ai/answerGate): a road's answer is judged before
   * it is returned - invented order numbers, filler, markdown, length,
   * refusals. A failing answer on a road that has a next road returns null
   * and the loop moves on; on the last road it is repaired mechanically.
   */
  const { judge, repair } = require('./answerGate');
  const accept = async (r, extra = {}, { last = false } = {}) => {
    const out = await done(r, extra);
    const verdict = await judge(out.answer, { role, user, hadTools: (r.calls || []).length > 0 || !last });
    // Cosmetic faults are cleaned in place, on any road - the model's thinking stays.
    const cleaned = verdict.cosmetic.length ? repair(out.answer, { invented: [] }) : out.answer;
    if (!verdict.problems.length) return verdict.cosmetic.length ? { ...out, answer: cleaned, quality: verdict.cosmetic } : out;
    if (!last) {
      failures.push(`${r.model}: gate - ${verdict.problems.join(', ')}`);
      return null;
    }
    console.warn(`assistant: gate repaired ${r.model}: ${verdict.problems.join(', ')}`);
    return { ...out, answer: repair(cleaned, verdict), quality: [...verdict.problems, ...verdict.cosmetic] };
  };
  // A missing key is a reason to take the next road, not to stop (Render had Groq before Gemini, 13 Sep).
  const retryable = (reason) => /429|quota|rate|reach|503|502|nothing|never answered|not set/i.test(reason || '');

  if (textModel !== 'nano') {
    // Road 1 - Gemini with tools, full prompt.
    const withTools = { system: SYSTEM(role, true, language, user), declarations: declarationsFor(role, user), run: (name, args) => runTool(name, args, { role, user }) };
    let r = await generateWithTools([...turns(1200), { role: 'user', parts: [{ text: buildPrompt({ compact: false }) }] }], withTools);
    // 'gemini' mode never leaves Google: a gate failure there is repaired, not re-routed.
    if (r.ok) { const a = await accept(r, {}, { last: textModel === 'gemini' }); if (a) return a; }
    if (!r.ok && (textModel === 'gemini' || !retryable(r.reason))) return { ok: false, reason: r.reason };
    if (!r.ok) failures.push(`gemini: ${r.reason.slice(0, 60)}`);

    // Road 1b - Gemini flash-lite, same tools. Its free quota is separate from
    // flash's (14 Sep 2026: flash said "free_tier_requests, limit: 20" while
    // lite answered at once) - a second Gemini before we leave Google's tools.
    // Lite is tried when flash is out of quota - or when flash answered and the gate refused it.
    if (r.ok || /429|quota/i.test(r.reason)) {
      r = await generateWithTools([...turns(1200), { role: 'user', parts: [{ text: buildPrompt({ compact: false }) }] }], { ...withTools, model: process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite' });
      if (r.ok) { const a = await accept(r); if (a) return a; } else failures.push(`gemini-lite: ${r.reason.slice(0, 60)}`);
    }

    // Road 2 - Groq gpt-oss-120b with tools, compact prompt, two rounds at most
    // (each round re-sends the prompt against the same 8k/minute).
    const { groqWithTools, groqPlain } = require('./groq');
    const g = await groqWithTools([...turns(600), { role: 'user', parts: [{ text: buildPrompt({ compact: true }) }] }], { ...withTools, maxRounds: 2 });
    if (g.ok) {
      console.warn(`assistant: ${failures.join('; ')} - answered by Groq ${g.model}`);
      const a = await accept(g); if (a) return a;
    }
    failures.push(`groq: ${g.reason.slice(0, 60)}`);

    // Road 3 - Groq compound-mini: no custom tools, but 70k tokens/minute and
    // its own web search; the full prompt fits.
    const c = await groqPlain([...turns(1200), { role: 'user', parts: [{ text: buildPrompt({ compact: false }) }] }], { system: SYSTEM(role, false, language, user), model: 'groq/compound-mini' });
    if (c.ok) {
      console.warn(`assistant: ${failures.join('; ')} - answered by ${c.model}`);
      const a = await accept(c, { searchedWeb: c.searchedWeb }); if (a) return a;
    }
    failures.push(`compound: ${c.reason.slice(0, 60)}`);

    // Road 4 - Cloudflare Workers AI (Llama 3.3 70B) with our tools, compact
    // prompt: the last road that can still look an order up (plan 2.25;
    // 10k neurons/day shared with the image editor).
    const { cloudflareWithTools } = require('./cloudflareText');
    const cf = await cloudflareWithTools([...turns(600), { role: 'user', parts: [{ text: buildPrompt({ compact: true }) }] }], { ...withTools, maxRounds: 2 });
    if (cf.ok) {
      console.warn(`assistant: ${failures.join('; ')} - answered by ${cf.model}`);
      const a = await accept(cf); if (a) return a;
    }
    failures.push(`cloudflare: ${cf.reason.slice(0, 60)}`);
  }

  // Road 5 - Pollinations nano, compact prompt, no tools: the prefetch and
  // the passages are all it has.
  const flat = history.slice(-6).map((m) => `${m.role === 'user' ? 'THEY SAID' : 'YOU SAID'}: ${String(m.text || '').slice(0, 600)}`).join('\n');
  const r = await generate(`${flat ? `EARLIER IN THIS CONVERSATION\n${flat}\n\n` : ''}${buildPrompt({ compact: true })}`, { system: SYSTEM(role, false, language, user), textModel: 'nano', attempts: 1 });
  if (!r.ok) return { ok: false, reason: [...failures, `nano: ${r.reason.slice(0, 60)}`].join('; ') };
  if (failures.length) console.warn(`assistant: ${failures.join('; ')} - answered by ${r.model || 'nano'}`);
  return accept({ ...r, model: r.model || 'nano', calls: [] }, {}, { last: true });
};

module.exports = { ask, contextFor, SYSTEM };
