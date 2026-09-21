/**
 * The home page as an ordered list of sections (Option A, S1 - 21 Sep 2026).
 *
 * WHY (plan §4, researched 20 Sep)
 *   Amazon, Flipkart and Etsy homes are curated by a person, never by
 *   "recently added"; Shopify's theme editor gives the merchant a list of
 *   sections to add, reorder and switch off. Ours had one fixed order and one
 *   "featured strip". This file is the contract between the admin's Home
 *   page tab (web/components/admin/HomeSections) and the storefront's
 *   app/page.js: whatever is saved passes through here, so the page never
 *   sees a shape it cannot draw.
 *
 * TYPES
 *   hero        always first, cannot be disabled; copy comes from home.kicker/title/lead
 *   categories  up to 8 category tiles (admin-picked slugs, else the fullest ones)
 *   collection  a titled row: hand-picked product slugs first, else the /shop link's filters
 *   sellers     up to 8 shops (admin-picked seller user ids), each with its newest pieces
 *   banner      one image with a line and a link, optionally until a date
 *   newest      "Just added" - shown only when there are at least `min` products
 *
 * Reviews and a launch-banner request flow are S4/C in WHAT-IS-LEFT.
 */
const TYPES = ['hero', 'categories', 'collection', 'sellers', 'banner', 'newest'];
const MAX_TITLE = 60;
const MAX_PICKS = 8;

const DEFAULT_TITLES = {
  hero: '',
  categories: 'Browse by category',
  collection: 'Picked for you',
  sellers: 'Shops on ShopMaster Pro',
  banner: '',
  newest: 'Just added',
};

/** The layout a fresh platform ships with - what the page drew before S1. */
const DEFAULT_SECTIONS = [
  { type: 'hero', enabled: true, title: '' },
  { type: 'categories', enabled: true, title: DEFAULT_TITLES.categories, slugs: [] },
  { type: 'newest', enabled: true, title: DEFAULT_TITLES.newest, min: 4 },
];

const text = (v, max = MAX_TITLE) => String(v ?? '').trim().slice(0, max);
const slug = (v) => (/^[a-z0-9][a-z0-9-]{0,80}$/.test(String(v || '')) ? String(v) : null);
const picks = (list, clean = slug) => (Array.isArray(list) ? list : []).map(clean).filter(Boolean).slice(0, MAX_PICKS);
const shopHref = (v) => (/^\/shop(\?[^\s<>"']*)?$/.test(String(v || '')) ? String(v) : '/shop');
// A path on this site or an https address; never javascript:, never data:.
const safeHref = (v) => (/^\/(?!\/)[^\s<>"']*$/.test(String(v || '')) || /^https:\/\/[^\s<>"']+$/.test(String(v || '')) ? String(v) : '/shop');
const httpsImage = (v) => (/^https:\/\/[^\s<>"']+$/.test(String(v || '')) ? String(v) : '');
const dateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const one = (raw) => {
  const type = TYPES.includes(raw?.type) ? raw.type : null;
  if (!type) return null;
  const base = { type, enabled: type === 'hero' ? true : raw.enabled !== false, title: text(raw.title) || DEFAULT_TITLES[type] };
  switch (type) {
    case 'categories':
      return { ...base, slugs: picks(raw.slugs) };
    case 'collection':
      return { ...base, href: shopHref(raw.href), slugs: picks(raw.slugs), until: dateOrNull(raw.until) };
    case 'sellers':
      return { ...base, ids: picks(raw.ids, (v) => (v == null ? null : String(v).trim().slice(0, 40) || null)) };
    case 'banner':
      return { ...base, image: httpsImage(raw.image), text: text(raw.text, 140), href: safeHref(raw.href), until: dateOrNull(raw.until) };
    case 'newest':
      return { ...base, min: Math.min(24, Math.max(1, Number(raw.min) || 4)) };
    default:
      return base;
  }
};

/**
 * Whatever the admin saved → a list the page can draw: known types only, the
 * hero first and once, titles capped, links kept on this site.
 */
const normaliseSections = (list) => {
  if (!Array.isArray(list) || list.length === 0) return DEFAULT_SECTIONS.map((s) => ({ ...s }));
  const rest = list.map(one).filter(Boolean).filter((s) => s.type !== 'hero');
  return [{ type: 'hero', enabled: true, title: '' }, ...rest].slice(0, 12);
};

/** A section that has run out (collection/banner with a past `until`). */
const isLive = (section, now = Date.now()) => !section.until || new Date(section.until).getTime() + 86400000 > now;

module.exports = { TYPES, DEFAULT_SECTIONS, DEFAULT_TITLES, normaliseSections, isLive, MAX_PICKS };
