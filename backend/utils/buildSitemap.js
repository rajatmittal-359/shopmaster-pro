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

const STATIC_ROUTES = [
  { loc: '/', priority: '1.00', changefreq: 'daily' },
  { loc: '/shop', priority: '0.90', changefreq: 'daily' },
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

  entries.push(...categoryEntries, ...productEntries);

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
      total: entries.length,
    },
  };
};

module.exports = { buildSitemap, STATIC_ROUTES, siteUrl };
