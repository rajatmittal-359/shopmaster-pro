/**
 * Text moderation with OUR policy (plan 2.22 - the Trust queue).
 *
 * Two layers, the cheap one always on:
 *   1. Rules - a phone number, a WhatsApp handle, an email, a link, a
 *      known abusive word (Hindi, Hinglish, English). Milliseconds, no
 *      quota, never wrong about a phone number.
 *   2. gpt-oss-safeguard-20b on Groq - OpenAI's policy-following moderation
 *      model (Llama Guard's successor there, free). It reads the policy
 *      below and the text and says what it violates. ~400 ms. When Groq is
 *      out, the rules alone decide - nothing is ever un-moderated.
 *
 * What is moderated, and what happens:
 *   review comments        flagged → held, not shown, not counted in the
 *                          rating, admin approves or removes
 *   seller About / links   flagged → saved but not shown until approved
 *   coupon names           flagged → refused at creation
 *   dispute / return text  flagged → a mark for the admin (never blocked -
 *                          an angry customer is still a customer)
 *
 * WHY OFF-PLATFORM CONTACT IS THE FIRST RULE
 *   "Seedha mujhse lo, WhatsApp karo, sasta milega" in a review is how a
 *   marketplace loses both its commission and its buyer protection; every
 *   Indian marketplace strips phone numbers from public text for the same
 *   reason. Abuse is second: a seller who reads it is a seller who leaves.
 */
const POLICY = `You moderate short user text on ShopMaster Pro, an Indian marketplace (Hindi, Hinglish and English).
Flag text that:
1. contact_request - gives or asks for a phone number, WhatsApp, Telegram, Instagram handle, email or any link to deal outside the platform ("seedha mujhse lo", "call karo", "DM me").
2. abuse - insults, threats, slurs or harassment towards a person, a seller or a community, in any language including Hindi/Hinglish transliteration (e.g. gaali).
3. sexual - sexual content or solicitation.
4. spam - advertising unrelated to the product, repeated promotional text, or a generic fake review (praise with no product detail plus a link or a phone number).
5. pii - someone else's address, Aadhaar, bank or card details.
Do NOT flag: ordinary complaints ("bahut kharab quality", "paisa barbaad"), negative ratings, mentions of the platform's own Help page, or a seller's shop name.
Reply with ONE JSON object: {"flagged": boolean, "categories": ["contact_request"|"abuse"|"sexual"|"spam"|"pii"], "severity": "low"|"medium"|"high", "reason": "one short sentence"}.`;

const PHONE = /(?:\+91[\s-]?)?(?:(?<!\d)[6-9]\d{9}(?!\d)|(?<!\d)\d{5}[\s-]\d{5}(?!\d))/;
const CONTACT = /whats?app|telegram|insta(?:gram)?\b|\bdm\b|call\s*(?:karo|me|kar)|number\s*(?:do|dedo|bhejo)|contact\s*(?:karo|me)|email|gmail|@[a-z0-9_.]{3,}/i;
const LINK = /https?:\/\/|www\.|\.(?:com|in|co|net|org|shop|store)\b/i;
const ABUSE = /\b(?:madarchod|bhenchod|bhosdike|chutiya|chutiye|gandu|gaand|harami|kutte|kamine|kamina|randi|saale|saala|behen ?ke ?laude|lund|fuck(?:er|ing)?|bitch|bastard|asshole|slut|whore|scam(?:mer)?s? (?:log|hain))\b|मादरचोद|भेनचोद|चूतिया|गांडू|हरामी|कुत्ते|कमीने|रंडी/i;

const byRules = (text) => {
  const t = String(text || '');
  const categories = [];
  if (PHONE.test(t) || CONTACT.test(t)) categories.push('contact_request');
  if (LINK.test(t)) categories.push(categories.includes('contact_request') ? 'spam' : 'contact_request');
  if (ABUSE.test(t)) categories.push('abuse');
  const flagged = categories.length > 0;
  return { flagged, categories: [...new Set(categories)], severity: categories.includes('abuse') ? 'high' : flagged ? 'medium' : 'low', reason: flagged ? `Rules: ${categories.join(', ')}` : '' };
};

const byModel = async (text, context) => {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.GROQ_MODERATION_MODEL || 'openai/gpt-oss-safeguard-20b', messages: [{ role: 'system', content: POLICY }, { role: 'user', content: `Context: ${context}\nText: """${String(text).slice(0, 1500)}"""` }], temperature: 0, max_tokens: 200 }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const m = String(d?.choices?.[0]?.message?.content || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    return { flagged: Boolean(j.flagged), categories: Array.isArray(j.categories) ? j.categories.filter((c) => typeof c === 'string').slice(0, 5) : [], severity: ['low', 'medium', 'high'].includes(j.severity) ? j.severity : 'low', reason: String(j.reason || '').slice(0, 200) };
  } catch {
    return null;
  }
};

/**
 * @param {string} text
 * @param {{context?: 'review'|'seller about'|'coupon name'|'dispute'|'return request'}} [opts]
 * @returns {Promise<{flagged:boolean, categories:string[], severity:'low'|'medium'|'high', reason:string, via:'rules'|'rules+model'}>}
 */
const moderateText = async (text, { context = 'user text' } = {}) => {
  const rules = byRules(text);
  if (String(text || '').trim().length < 3) return { ...rules, via: 'rules' };
  const model = await byModel(text, context);
  if (!model) return { ...rules, via: 'rules' };
  const categories = [...new Set([...rules.categories, ...model.categories])];
  const flagged = rules.flagged || model.flagged;
  const rank = { low: 0, medium: 1, high: 2 };
  const severity = [rules.severity, model.severity].sort((a, b) => rank[b] - rank[a])[0];
  return { flagged, categories, severity: flagged ? severity : 'low', reason: model.flagged ? model.reason : rules.reason, via: 'rules+model' };
};

module.exports = { moderateText, byRules, POLICY };
