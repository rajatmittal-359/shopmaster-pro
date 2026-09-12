/**
 * How complete a listing is, as one number a seller can push up.
 *
 * Amazon's Listing Quality dashboard, Etsy's listing score and Shopify's
 * SEO card all do the same thing: turn "fill these in" into a score with the
 * next fix on top. Each line below is a thing Google (feed or search) or a
 * shopper actually reads - nothing here is style. The same function scores
 * the live form (the web bundle imports this file) and the saved product.
 *
 * @returns {{ score: number, max: number, fixes: Array<{key:string, points:number, text:string, field:string}> }}
 */
const words = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

const CHECKS = [
  {
    key: 'title-length',
    points: 10,
    field: 'name',
    text: 'Give the title at least four words - type, material or style, and who it is for',
    ok: (p) => String(p.name || '').trim().split(/\s+/).filter(Boolean).length >= 4,
  },
  {
    key: 'title-colour',
    points: 5,
    field: 'name',
    text: 'Put the colour in the title - it is the first word shoppers filter by',
    ok: (p) =>
      Boolean(p.name) && (!p.color || String(p.name).toLowerCase().includes(String(p.color).toLowerCase().split(/\s+/).pop())),
  },
  {
    key: 'title-short',
    points: 5,
    field: 'name',
    text: 'Keep the title under 90 characters - Google cuts it there',
    ok: (p) => String(p.name || '').length > 0 && String(p.name || '').length <= 90,
  },
  { key: 'photo-one', points: 10, field: 'images', text: 'Add a photo - nothing sells without one', ok: (p) => (p.images || []).length >= 1 },
  {
    key: 'photo-three',
    points: 10,
    field: 'images',
    text: 'Add at least three photos - front, detail, worn or in use',
    ok: (p) => (p.images || []).length >= 3,
  },
  {
    key: 'desc-length',
    points: 10,
    field: 'description',
    text: 'Write 90 words or more - what it is, what it goes with, when to wear or use it',
    ok: (p) => words(p.description) >= 90,
  },
  {
    key: 'desc-structure',
    points: 5,
    field: 'description',
    text: 'Break the description into two paragraphs or a bullet list',
    ok: (p) => /<\/p>\s*<p>|<li>/i.test(String(p.description || '')),
  },
  { key: 'category', points: 10, field: 'category', text: 'Choose the category - it decides where the product appears', ok: (p) => Boolean(p.category) },
  {
    key: 'colour',
    points: 10,
    field: 'color',
    text: 'Set the colour - Google Shopping needs it, and shoppers filter by it',
    ok: (p) => Boolean(p.color),
  },
  { key: 'audience', points: 5, field: 'gender', text: 'Say who it is for and the age group', ok: (p) => Boolean(p.gender) && Boolean(p.ageGroup) },
  {
    key: 'size',
    points: 5,
    field: 'size',
    text: 'Add the size - clothing and footwear are refused by Google without it',
    ok: (p) => Boolean(p.name) && (!p.needsSize || Boolean(p.size)),
  },
  { key: 'identity', points: 5, field: 'brand', text: 'Add a brand or your own item code', ok: (p) => Boolean(p.brand) || Boolean(p.sku) },
  { key: 'weight', points: 5, field: 'weight', text: 'Add the packed weight - the courier quotes on it', ok: (p) => Number(p.weight) > 0 },
  { key: 'tags', points: 5, field: 'tags', text: 'Add three or more search words people would type', ok: (p) => (p.tags || []).length >= 3 },
];

const scoreListing = (p = {}) => {
  let score = 0;
  const fixes = [];
  for (const c of CHECKS) {
    if (c.ok(p)) score += c.points;
    else fixes.push({ key: c.key, points: c.points, text: c.text, field: c.field });
  }
  fixes.sort((a, b) => b.points - a.points);
  return { score, fixes, max: CHECKS.reduce((s, c) => s + c.points, 0) };
};

module.exports = { scoreListing, CHECKS };
