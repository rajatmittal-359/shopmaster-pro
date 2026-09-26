#!/usr/bin/env node
/**
 * Audit the LIVE catalogue against the standard the product itself defines.
 *
 * Written 26 Sep 2026, when Rajat asked whether Mummy and Rahul had filled the
 * data properly - "kya aisa hai jo matter karta hai lekin bhara nahi hai".
 *
 * WHY IT READS THE PUBLIC API AND NOT THE DATABASE
 *   Production is a different database from the dev one, and the laptop has no
 *   production connection: `scripts/run.js` expects a READ-ONLY Atlas user
 *   (`MONGO_URI_READ`) that was never created. The public API serves the whole
 *   product document anyway, so the audit needs no credentials and cannot
 *   write anything. If the read-only user ever exists, point this at Mongo.
 *
 * WHAT IT WILL NOT DO
 *   Change anything. Most of what it looks at is the seller's own work, and
 *   overwriting that silently is the wrong move - it prints, a human decides.
 *
 *   node scripts/audit-listings.js            the live site
 *   node scripts/audit-listings.js --json     machine-readable
 */
const path = require('path');

const SITE = process.env.AUDIT_SITE || 'https://www.shopmasterpro.in';
const JSON_OUT = process.argv.includes('--json');
const { templateFor, TEMPLATES, missingRequired } = require(path.join(__dirname, '..', 'backend', 'config', 'listingTemplates'));

const txt = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const words = (h) => (txt(h) ? txt(h).split(/\s+/).length : 0);

const fetchAll = async () => {
  const out = [];
  let page = 1;
  let pages = 1;
  do {
    const res = await fetch(`${SITE}/api/public/products?limit=100&page=${page}`);
    if (!res.ok) throw new Error(`products page ${page}: ${res.status}`);
    const d = await res.json();
    out.push(...(d.products || []));
    pages = d.totalPages || 1;
    page += 1;
  } while (page <= pages);
  return out.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
};

const audit = (all) => {
  const findings = [];
  const add = (p, sev, code, detail) =>
    findings.push({ sev, code, name: p.name, shop: p.shop?.name || String(p.sellerId), detail });

  for (const p of all) {
    /*
     * The stored templateKey is the truth. The public API returns the category
     * WITHOUT its parent, and the templates are keyed on the TOP category, so
     * templateFor() alone would answer "general" for everything and every
     * category rule below would quietly pass.
     */
    const tpl = TEMPLATES[p.templateKey] || templateFor(p.category || {});
    const attrs = p.attributes || {};

    if (!p.category?.name) add(p, 'BLOCKER', 'no-category', 'no category');
    if (!p.price) add(p, 'BLOCKER', 'no-price', 'no price');
    if (p.mrp && p.price && p.mrp < p.price) add(p, 'BLOCKER', 'mrp-below-price', `MRP ${p.mrp} < price ${p.price}`);
    if (!(p.images || []).length) add(p, 'BLOCKER', 'no-image', 'no photograph');

    const foreign = (p.images || []).filter((i) => !/res\.cloudinary\.com/.test(i.url || i));
    if (foreign.length) add(p, 'BLOCKER', 'image-hotlinked', `${foreign.length} photo(s) not on our Cloudinary`);

    if (txt(p.description).toLowerCase().includes('imitation') && tpl.key !== 'jewellery') {
      add(p, 'BLOCKER', 'wrong-claim', 'calls itself imitation jewellery and is not jewellery');
    }

    if ((p.images || []).length === 1) add(p, 'COSTS', 'one-image', 'a single photograph');
    if (!p.weight) add(p, 'COSTS', 'no-weight', 'no weight - every courier quote for it is a guess');
    if (words(p.description) && words(p.description) < 40) add(p, 'COSTS', 'description-thin', `${words(p.description)} words`);
    if (!Object.keys(attrs).length) add(p, 'COSTS', 'attrs-empty', `no facts filled (template ${tpl.key})`);
    else {
      const miss = missingRequired(tpl, attrs) || [];
      if (miss.length) add(p, 'COSTS', 'attrs-missing', `${tpl.key}: ${miss.join(', ')}`);
    }
    if (!(p.highlights || []).length) add(p, 'COSTS', 'no-highlights', 'no bullet highlights');
    if (!(p.tags || []).length) add(p, 'COSTS', 'no-tags', 'no search words');
    if (p.stock === 0) add(p, 'COSTS', 'out-of-stock', 'stock 0 but still listed');

    if (!(p.faqs || []).length) add(p, 'THIN', 'no-faqs', 'no FAQs - this is what an AI answer quotes');
    if (!p.countryOfOrigin) add(p, 'THIN', 'no-origin', 'no country of origin');
    if (!p.manufacturer) add(p, 'THIN', 'no-manufacturer', 'no manufacturer (Legal Metrology)');
    if (!p.netQuantity) add(p, 'THIN', 'no-net-quantity', 'no net quantity (Legal Metrology)');
    if (!p.hsn) add(p, 'THIN', 'no-hsn', 'no HSN');
  }

  /*
   * Brand spelling is a per-SHOP check, not a per-product one: two spellings
   * of one shop's name split it into two brands in Merchant Center and in
   * every brand search.
   */
  const brandsByShop = {};
  for (const p of all) {
    const shop = p.shop?.name || String(p.sellerId);
    if (!p.brand) continue;
    (brandsByShop[shop] = brandsByShop[shop] || new Set()).add(p.brand);
  }
  for (const [shop, set] of Object.entries(brandsByShop)) {
    if (set.size > 1) {
      findings.push({
        sev: 'COSTS',
        code: 'brand-spelt-two-ways',
        name: `(${shop}, all products)`,
        shop,
        detail: [...set].map((b) => `"${b}"`).join(' vs '),
      });
    }
  }
  return findings;
};

(async () => {
  const all = await fetchAll();
  const findings = audit(all);

  if (JSON_OUT) {
    console.log(JSON.stringify({ site: SITE, products: all.length, findings }, null, 1));
    return;
  }

  const shops = {};
  for (const p of all) {
    const s = p.shop?.name || String(p.sellerId);
    shops[s] = shops[s] || { n: 0, img: 0, noWeight: 0 };
    shops[s].n += 1;
    shops[s].img += (p.images || []).length;
    if (!p.weight) shops[s].noWeight += 1;
  }

  console.log(`${SITE}  ·  ${all.length} live products  ·  ${findings.length} findings\n`);
  console.log('BY SHOP');
  for (const [s, v] of Object.entries(shops)) {
    console.log(`  ${s.padEnd(18)} ${String(v.n).padStart(3)} products · ${(v.img / v.n).toFixed(1)} photos each · ${v.noWeight} without a weight`);
  }

  const ORDER = { BLOCKER: 0, COSTS: 1, THIN: 2 };
  const grouped = {};
  for (const f of findings) (grouped[`${f.sev}|${f.code}`] = grouped[`${f.sev}|${f.code}`] || []).push(f);

  console.log('\nBY ISSUE, worst first');
  for (const [k, list] of Object.entries(grouped).sort((a, b) => ORDER[a[0].split('|')[0]] - ORDER[b[0].split('|')[0]] || b[1].length - a[1].length)) {
    const [sev, code] = k.split('|');
    console.log(`  ${sev.padEnd(8)} ${code.padEnd(22)} ${String(list.length).padStart(3)}   ${list[0].detail}`);
  }

  const blockers = findings.filter((f) => f.sev === 'BLOCKER');
  console.log(`\n${blockers.length ? `${blockers.length} BLOCKER(S):` : 'No blockers.'}`);
  for (const f of blockers) console.log(`  ${f.shop.padEnd(16)} ${f.name.slice(0, 44).padEnd(45)} ${f.code}`);
})();
