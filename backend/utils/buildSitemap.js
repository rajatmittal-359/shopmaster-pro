const Product = require('../models/Product');
const Category = require('../models/Category');

/**
 * The sitemap, built from the catalogue that exists right now.
 *
 * WHY THIS IS A MODULE AND NOT JUST THE SCRIPT
 *   generateSitemap.js wrote frontend/public/sitemap.xml and somebody had to
 *   remember to run it. Nobody did: on 7 September 2026 the deployed file was
 *   dated 30 August, and Google's copy was dated 1 January - six URLs against a
 *   catalogue of ninety-two. A sitemap whose whole job is to say "here is what
 *   exists" had become a list of what existed nine months ago.
 *
 *   That is the same two-sources-of-truth shape that was removed from pricing
 *   and from the product feed, and it fails the same way: silently, in the
 *   direction nobody checks. So the XML is generated here, the endpoint serves
 *   it live from the database, and the script keeps working for anyone who
 *   wants a file - both calling this, so they cannot disagree.
 *
 * WHAT IS DELIBERATELY LEFT OUT
 *   Login, register, cart, checkout and the dashboards. They are private or
 *   transactional, and an earlier sitemap listing them was asking Google to
 *   index pages it could never usefully show anybody.
 *
 *   Inactive and out-of-stock products too: a page that says "unavailable" is a
 *   soft 404, and a sitemap full of them teaches Google to trust the file less.
 */

/** The site customers actually visit, which is where every URL must point. */
const siteUrl = () =>
  (process.env.SITE_URL || 'https://www.shopmasterpro.in').replace(/\/$/, '');

/*
 * The pages that are not the catalogue (24 Sep 2026). They were reachable from
 * the footer and nowhere else, so Google found them slowly and treated them as
 * an afterthought - including /how-we-rank, which is the ranking promise the
 * law asks us to publish and the page a doubting seller actually searches for.
 */
const STATIC_ROUTES = [
  { loc: '/', priority: '1.00', changefreq: 'daily' },
  { loc: '/shop', priority: '0.90', changefreq: 'daily' },
  { loc: '/sell', priority: '0.70', changefreq: 'monthly' },
  { loc: '/how-we-rank', priority: '0.60', changefreq: 'monthly' },
  { loc: '/selling-policy', priority: '0.50', changefreq: 'monthly' },
  { loc: '/pricing', priority: '0.50', changefreq: 'monthly' },
  { loc: '/help', priority: '0.50', changefreq: 'monthly' },
  { loc: '/contact', priority: '0.50', changefreq: 'monthly' },
  { loc: '/shipping-policy', priority: '0.40', changefreq: 'monthly' },
  { loc: '/refund-policy', priority: '0.40', changefreq: 'monthly' },
  { loc: '/terms', priority: '0.30', changefreq: 'monthly' },
  { loc: '/privacy', priority: '0.30', changefreq: 'monthly' },
  { loc: '/compliance', priority: '0.30', changefreq: 'monthly' },
];

const escapeXml = (s = '') =>
  String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])
  );

const urlEntry = (base, { loc, priority, changefreq, lastmod }) =>
  [
    '  <url>',
    `    <loc>${escapeXml(base + loc)}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');

/**
 * @returns {Promise<{xml: string, counts: {static: number, categories: number, products: number, total: number}}>}
 */
const buildSitemap = async () => {
  const base = siteUrl();
  const entries = [...STATIC_ROUTES];

  // Category landing pages, browsable ones only - active, and with no inactive
  // ancestor hiding them.
  const browsableIds = await Category.getBrowsableIds();
  const categories = await Category.find({ _id: { $in: browsableIds } })
    .select('slug updatedAt')
    .lean();

  const categoryEntries = categories
    .filter((c) => c.slug)
    .map((c) => ({
      loc: `/shop?category=${c.slug}`,
      priority: '0.70',
      changefreq: 'weekly',
      lastmod: c.updatedAt,
    }));

  const products = await Product.find(
    await require('./hiddenSellers').withoutHiddenSellers({
      isActive: true,
      isDeleted: { $ne: true },
      stock: { $gt: 0 },
      slug: { $exists: true, $ne: null },
      category: { $in: browsableIds },
    })
  )
    .select('slug updatedAt')
    .lean();

  const productEntries = products.map((p) => ({
    loc: `/products/${p.slug}`,
    priority: '0.80',
    changefreq: 'weekly',
    lastmod: p.updatedAt,
  }));

  /*
   * The shops themselves (24 Sep 2026). A shop page carries the name, the city
   * and the reviews - it is the Jaipur trust story in one URL - and Google
   * could only reach it by crawling a product page first. Approved shops only,
   * and never one the platform is hiding; a suspended shop's page is gone.
   */
  // The hidden-seller helper filters on `sellerId`; here the same people are
  // the documents themselves, keyed by `userId`, so the ids are applied by hand.
  const hidden = await require('./hiddenSellers').hiddenSellerIds();
  const shops = await require('../models/Seller')
    .find({
      isApproved: true,
      status: { $ne: 'suspended' },
      ...(hidden.length ? { userId: { $nin: hidden } } : {}),
    })
    .select('userId updatedAt')
    .lean();

  const shopEntries = shops
    .filter((sh) => sh.userId)
    .map((sh) => ({
      loc: `/sellers/${sh.userId}`,
      priority: '0.60',
      changefreq: 'weekly',
      lastmod: sh.updatedAt,
    }));

  entries.push(...categoryEntries, ...productEntries, ...shopEntries);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((e) => urlEntry(base, e)),
    '</urlset>',
    '',
  ].join('\n');

  return {
    xml,
    counts: {
      static: STATIC_ROUTES.length,
      categories: categoryEntries.length,
      products: productEntries.length,
      shops: shopEntries.length,
      total: entries.length,
    },
  };
};

module.exports = { buildSitemap, STATIC_ROUTES, siteUrl };
