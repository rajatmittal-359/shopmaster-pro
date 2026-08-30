/**
 * Writes frontend/public/sitemap.xml from live data.
 *
 * The committed sitemap listed six static URLs and no products at all, and two
 * of those URLs (/cart, /checkout) are not even routes in the app. Search
 * engines therefore had no way to discover a single product page.
 *
 * Run this before a frontend build so the deployed sitemap matches the catalogue.
 *
 *   node generateSitemap.js --dry     print the XML, write nothing
 *   node generateSitemap.js           write frontend/public/sitemap.xml
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product');
const Category = require('./models/Category');

const DRY = process.argv.includes('--dry');

const SITE_URL = (process.env.SITE_URL || 'https://www.shopmasterpro.in').replace(/\/$/, '');
const OUT = path.join(__dirname, '..', 'frontend', 'public', 'sitemap.xml');

// Only routes that actually exist and are worth indexing. Login, register,
// cart, checkout and the dashboards are private or transactional - they were
// in the old sitemap and should not have been.
const STATIC_ROUTES = [
  { loc: '/', priority: '1.00', changefreq: 'daily' },
  { loc: '/shop', priority: '0.90', changefreq: 'daily' },
];

const escapeXml = (s = '') =>
  String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])
  );

const urlEntry = ({ loc, priority, changefreq, lastmod }) =>
  [
    '  <url>',
    `    <loc>${escapeXml(SITE_URL + loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod.toISOString().split('T')[0]}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.name}`);
  console.log(`Site URL: ${SITE_URL}\n`);

  const entries = [...STATIC_ROUTES];

  // Category landing pages, browsable ones only (active, no inactive ancestor).
  const browsableIds = await Category.getBrowsableIds();
  const categories = await Category.find({ _id: { $in: browsableIds } })
    .select('slug updatedAt')
    .lean();

  categories
    .filter((c) => c.slug)
    .forEach((c) =>
      entries.push({
        loc: `/shop?category=${c.slug}`,
        priority: '0.70',
        changefreq: 'weekly',
        lastmod: c.updatedAt,
      })
    );

  // Only live products: inactive or out-of-stock pages would be soft-404s.
  const products = await Product.find({
    isActive: true,
    stock: { $gt: 0 },
    slug: { $exists: true, $ne: null },
    category: { $in: browsableIds },
  })
    .select('slug updatedAt')
    .lean();

  products.forEach((p) =>
    entries.push({
      loc: `/products/${p.slug}`,
      priority: '0.80',
      changefreq: 'weekly',
      lastmod: p.updatedAt,
    })
  );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(urlEntry),
    '</urlset>',
    '',
  ].join('\n');

  console.log(`  static pages : ${STATIC_ROUTES.length}`);
  console.log(`  categories   : ${entries.length - STATIC_ROUTES.length - products.length}`);
  console.log(`  products     : ${products.length}`);
  console.log(`  total URLs   : ${entries.length}`);

  if (DRY) {
    console.log('\n--- first 20 lines ---');
    console.log(xml.split('\n').slice(0, 20).join('\n'));
    console.log('\nDry run - nothing written.');
  } else {
    fs.writeFileSync(OUT, xml, 'utf8');
    console.log(`\nWritten: ${OUT}`);
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('\nSitemap generation failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
