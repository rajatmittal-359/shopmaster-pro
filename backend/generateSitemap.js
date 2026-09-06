/**
 * Writes frontend/public/sitemap.xml from live data.
 *
 * NOT THE SOURCE OF TRUTH ANY MORE. The sitemap is served live at
 * `/sitemap.xml` by controllers/sitemapController.js, because a file somebody
 * has to remember to regenerate is a file that goes stale - and this one did,
 * for nine months, while nothing failed and nothing warned.
 *
 * This script is kept for the one thing an endpoint cannot do: produce a
 * physical file, for inspection or for a static host that is not proxying to
 * the API yet. It calls the same builder the endpoint does, so the two cannot
 * disagree.
 *
 *   node generateSitemap.js --dry     print a summary and the first lines
 *   node generateSitemap.js           write frontend/public/sitemap.xml
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const { buildSitemap, siteUrl } = require('./utils/buildSitemap');

const DRY = process.argv.includes('--dry');
const OUT = path.join(__dirname, '..', 'frontend', 'public', 'sitemap.xml');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.name}`);
  console.log(`Site URL: ${siteUrl()}\n`);

  const { xml, counts } = await buildSitemap();

  console.log(`  static pages : ${counts.static}`);
  console.log(`  categories   : ${counts.categories}`);
  console.log(`  products     : ${counts.products}`);
  console.log(`  total URLs   : ${counts.total}`);

  if (DRY) {
    console.log('\n--- first 20 lines ---');
    console.log(xml.split('\n').slice(0, 20).join('\n'));
    console.log('\nDry run - nothing written.');
  } else {
    fs.writeFileSync(OUT, xml, 'utf8');
    console.log(`\nWritten: ${OUT}`);
    console.log('Note: the live sitemap is served from /sitemap.xml, not this file.');
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('\nSitemap generation failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
