const Product = require('../models/Product');
const { effectivePrice } = require('../utils/discount');

/**
 * The product feed Google fetches on a schedule.
 *
 * WHY A FEED AND NOT GOOGLE'S "SCAN MY WEBSITE"
 *   Merchant Center offers an AI scan of the site, and it says so itself: it is
 *   a ONE-TIME scan. Stock changes with every order, price changes when a sale
 *   starts, products come and go. A scan is stale the next morning - and worse,
 *   it GUESSES at price and availability. A guessed price advertised on Google
 *   while the site charges another is the exact complaint the CCPA fined
 *   FirstCry over.
 *
 *   This is generated from the same database the shop sells from, so what
 *   Google advertises and what the customer is charged cannot disagree.
 *
 * WHY IT IS PUBLIC AND UNAUTHENTICATED
 *   Google fetches it as an anonymous crawler. Everything in it is already on
 *   the public product pages - names, prices, images - so there is nothing here
 *   a visitor could not read anyway. Nothing about sellers, orders or margins
 *   goes near it.
 */

/** The site customers actually visit, which is where every link must point. */
const SITE = process.env.FRONTEND_URL || 'https://www.shopmasterpro.in';

/**
 * Representative freight, in rupees.
 *
 * India requires either shipping settings in Merchant Center or a shipping
 * attribute in the feed. This mirrors POLICY.shippingRate in the frontend's
 * config/policy.js - the same number the shipping policy page quotes, because a
 * feed that advertises one delivery charge while the page promises another is
 * a discrepancy Google checks for.
 */
const REPRESENTATIVE_SHIPPING = Number(process.env.FEED_SHIPPING_RATE) || 100;

/** XML has five characters that cannot appear raw, and product names contain them. */
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Descriptions are entered with markup; Google wants plain text. */
const plain = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000);

const rfc3339 = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

exports.googleProductFeed = async (req, res) => {
  try {
    /*
     * WHOSE products go to Google.
     *
     *   The Merchant Center account is named after the shop that owns it, and
     *   Google expects the account, the website and the products to tell the
     *   same story. Feeding another seller's goods under an account called
     *   "Charming Jewels" is the kind of mismatch that gets an account
     *   suspended for misrepresentation - and right now the other sellers in
     *   this database are seeded test data, which must not reach Google's
     *   review queue at all.
     *
     *   So by default only the platform's own shop is fed. The day real
     *   third-party sellers join, set FEED_ALL_SELLERS=true and rename the
     *   Merchant Center account to the marketplace rather than the shop.
     */
    const filter = { isActive: true, isDeleted: { $ne: true } };

    if (process.env.FEED_ALL_SELLERS !== 'true') {
      const Seller = require('../models/Seller');
      const own = await Seller.find({ isPlatformOwned: true }).select('userId').lean();
      filter.sellerId = { $in: own.map((s) => s.userId) };
    }

    const products = await Product.find(filter)
      .populate('category', 'name')
      .populate('sellerId', 'name')
      .sort({ updatedAt: -1 })
      .limit(5000)
      .lean();

    const items = products
      /*
       * image_link is required, and a product without one is rejected. Sending
       * it anyway earns a feed full of errors that buries the real problems.
       */
      .filter((p) => p.images?.length && p.name && p.price > 0)
      .map((p) => {
        const { price, onSale, was } = effectivePrice(p);
        const link = `${SITE}/products/${p.slug || p._id}`;

        const parts = [
          `<g:id>${esc(p._id)}</g:id>`,
          `<title>${esc(p.name.slice(0, 150))}</title>`,
          `<description>${esc(plain(p.description) || p.name)}</description>`,
          `<link>${esc(link)}</link>`,
          `<g:image_link>${esc(p.images[0])}</g:image_link>`,
        ];

        // Up to ten extra pictures; Google ignores the rest anyway.
        p.images.slice(1, 11).forEach((img) => {
          parts.push(`<g:additional_image_link>${esc(img)}</g:additional_image_link>`);
        });

        parts.push(
          `<g:availability>${p.stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability>`,
          `<g:condition>new</g:condition>`
        );

        /*
         * price is the REGULAR price and sale_price is what is being charged.
         * Sending only the sale price would advertise it as the normal price
         * and lose the strikethrough Google shows - and would mean the feed
         * disagreed with the page, which shows both.
         */
        if (onSale && was) {
          parts.push(`<g:price>${was.toFixed(2)} INR</g:price>`);
          parts.push(`<g:sale_price>${price.toFixed(2)} INR</g:sale_price>`);

          if (p.saleEndsAt) {
            const from = p.saleStartsAt || new Date();
            parts.push(
              `<g:sale_price_effective_date>${rfc3339(from)}/${rfc3339(p.saleEndsAt)}</g:sale_price_effective_date>`
            );
          }
        } else {
          parts.push(`<g:price>${price.toFixed(2)} INR</g:price>`);
        }

        const brand = p.brand || p.sellerId?.name;
        if (brand) parts.push(`<g:brand>${esc(brand)}</g:brand>`);
        if (p.sku) parts.push(`<g:mpn>${esc(p.sku)}</g:mpn>`);

        /*
         * Handmade and own-label jewellery has no barcode. Google's own
         * instruction for that case is identifier_exists: no - guessing at a
         * GTIN, or leaving the field out, gets the product disapproved.
         */
        if (!p.sku) parts.push(`<g:identifier_exists>no</g:identifier_exists>`);

        if (p.category?.name) {
          parts.push(`<g:product_type>${esc(p.category.name)}</g:product_type>`);
        }

        /*
         * India requires shipping in the feed or settings in the account.
         * A product the seller delivers free says zero, which is the same thing
         * the product page says.
         */
        parts.push(
          `<g:shipping><g:country>IN</g:country><g:price>${
            p.freeShipping ? '0.00' : REPRESENTATIVE_SHIPPING.toFixed(2)
          } INR</g:price></g:shipping>`
        );

        return `    <item>\n      ${parts.join('\n      ')}\n    </item>`;
      });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${esc(process.env.BUSINESS_NAME || 'Charming Jewels')}</title>
    <link>${esc(SITE)}</link>
    <description>Artificial jewellery from Jaipur.</description>
${items.join('\n')}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    // Google fetches this once a day; an hour of caching spares the database
    // without ever serving a price that is a day old.
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(xml);
  } catch (error) {
    console.error('PRODUCT FEED ERROR:', error.message);
    return res.status(500).send('<?xml version="1.0"?><error>Feed unavailable</error>');
  }
};
