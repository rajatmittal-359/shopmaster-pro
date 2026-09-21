/**
 * Market check for one listing (21 Sep 2026).
 *
 * Rajat: "kitne log kya bech rahe hain uske hisaab se rate recommend kar de,
 * aur shabd bhi trending aur SEO ke hisaab se." Meesho's price recommendation
 * and Amazon's pricing health do this from their own sales data; with a
 * catalogue of three we have none, so the outside world is asked: ONE Google-
 * grounded call (Gemini, 5,000 free grounded prompts a month) that returns a
 * price band for products like this on Indian marketplaces, the sites it saw,
 * and the words buyers type. Cached a day per title (aiCache), so "check
 * again" with nothing changed costs nothing.
 *
 * It is advice next to the price box, never an automatic change: the seller
 * knows the material and the margin, the model does not.
 */
const toRupees = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n) : null;
};

const dedupeWords = (list) => {
  const seen = new Set();
  const out = [];
  for (const w of Array.isArray(list) ? list : []) {
    const clean = String(w || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length === 10) break;
  }
  return out;
};

const marketPrompt = ({ name, categoryName, material, color }) => `Search Google Shopping and the Indian marketplaces (Amazon.in, Flipkart, Meesho, Myntra, Nykaa Fashion) for products like this one, sold in India, priced in INR (₹):

Product: ${name}${categoryName ? `\nCategory: ${categoryName}` : ''}${material ? `\nMaterial: ${material}` : ''}${color ? `\nColour: ${color}` : ''}

From what you find, answer with ONE JSON object and nothing else:
{"low": <typical low price in INR as a number>, "high": <typical high price in INR>, "typical": <the price most listings sit at>, "sources": ["site names you actually saw"], "words": ["6-10 short search phrases buyers type for this, as they type them, lowercase"], "note": "one sentence on what sells at which price, plain English"}
Use only prices of comparable items (same kind, similar material); ignore luxury outliers. If you cannot find comparable listings, return {"low":0,"high":0,"typical":0,"sources":[],"words":[],"note":"nothing comparable found"}.`;

/**
 * Normalises the model's JSON and says where the seller's price sits.
 * @returns {{ band: {low,high,typical}|null, sources: string[], words: string[], note: string, position: 'inside'|'above'|'below'|null }}
 */
const parseMarketCheck = (raw, sellerPrice) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  let low = toRupees(r.low);
  let high = toRupees(r.high);
  const typical = toRupees(r.typical);
  if (low && high && low > high) [low, high] = [high, low];
  const band = low && high ? { low, high, typical: typical && typical >= low && typical <= high ? typical : Math.round((low + high) / 2) } : null;

  const seen = new Set();
  const sources = (Array.isArray(r.sources) ? r.sources : [])
    .map((s) => String(s || '').trim())
    // A site name is short; an 80-character "source" is the model rambling.
    .filter((s) => s && s.length <= 40 && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()))
    .slice(0, 6);

  const price = toRupees(sellerPrice);
  const position = band && price ? (price < band.low ? 'below' : price > band.high ? 'above' : 'inside') : null;

  return { band, sources, words: dedupeWords(r.words), note: String(r.note || '').trim().slice(0, 240), position };
};

module.exports = { marketPrompt, parseMarketCheck };
