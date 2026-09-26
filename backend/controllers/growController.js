const Product = require('../models/Product');
const Seller = require('../models/Seller');
const Coupon = require('../models/Coupon');
const Review = require('../models/Review');
const { sendError } = require('../utils/apiError');
const { scoreListing } = require('../utils/listingScore');

/**
 * Get found on Google - the seller's readiness, measured, in order.
 *
 * The platform does the plumbing for every seller (sitemap, product schema,
 * Merchant feed, Search Console, Analytics, Customer Reviews, promotions
 * feed). What moves a SELLER's products on Google is the part only they
 * can do: complete listings, real photos, search words, an honest "about",
 * their own profiles linked, a city, reviews, a video, a promotion, and a
 * Google Business Profile for their shop. Every step here is measured from
 * their data - never a box they tick themselves.
 */
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const stepsFor = ({ seller, products, scored, reviews, coupons }) => {
  const n = products.length;
  const strong = scored.filter((p) => p.score >= 80).length;
  const photos3 = products.filter((p) => (p.images || []).length >= 3).length;
  const tagged = products.filter((p) => (p.tags || []).length >= 3).length;
  const videos = products.filter((p) => p.video && p.video.url).length;
  const links = Object.values((seller && seller.links) || {}).filter(Boolean).length;
  const about = (seller && seller.about) || '';
  const city = seller && seller.pickupAddress && seller.pickupAddress.city;
  const gbp = seller && seller.links && seller.links.googleBusiness;
  const withFaqs = products.filter((p) => (p.faqs || []).filter((x) => x && x.q && x.a).length >= 2).length;

  return [
    {
      key: 'listings',
      gate: 'Google',
      world: 'shopmaster',
      level: 'essential',
      title: 'Every listing scores 80 or more',
      done: n > 0 && strong === n,
      progress: `${strong} of ${n}`,
      value: pct(strong, n),
      why: 'The score is the checklist Google and shoppers both read: a title with the colour and material, a real description, size where it matters. Under 60, Google rarely shows the page at all.',
      how: 'Open a product - the three fixes are at the top of the form.',
      href: '/seller/products',
      minutes: 5,
    },
    {
      key: 'photos',
      gate: 'Google',
      world: 'shopmaster',
      level: 'essential',
      title: 'Three or more photos on each product',
      done: n > 0 && photos3 === n,
      progress: `${photos3} of ${n}`,
      value: pct(photos3, n),
      why: 'Google Shopping needs one clean photo on white; shoppers need the piece worn and close up. Products with three or more photos sell about twice as often.',
      how: 'The photo studio cleans backgrounds and makes the lifestyle shot from one photo.',
      href: '/seller/products/studio',
      minutes: 3,
    },
    {
      key: 'tags',
      world: 'shopmaster',
      level: 'optional',
      title: 'Search words on every product',
      done: n > 0 && tagged === n,
      progress: `${tagged} of ${n}`,
      value: pct(tagged, n),
      why: 'Our own search and Google both read them - "jhumki", "kundan choker", "bridal". They are how someone who does not know your product name finds it.',
      how: 'The listing panel suggests words; one tap adds them.',
      href: '/seller/products',
      minutes: 1,
    },
    {
      key: 'about',
      gate: 'Maps',
      world: 'shopmaster',
      level: 'essential',
      title: 'Tell shoppers about your shop',
      done: about.length >= 80,
      progress: about ? `${about.length} characters` : 'empty',
      value: about ? Math.min(100, pct(about.length, 80)) : 0,
      why: 'It becomes your shop page description on Google and the first thing a new buyer reads. Two honest sentences beat a paragraph of adjectives.',
      how: 'Settings - Your shop on the web - About.',
      href: '/seller/settings#web',
      minutes: 3,
    },
    {
      key: 'links',
      world: 'shopmaster',
      level: 'optional',
      title: 'Link your Instagram, Google listing or website',
      done: links >= 1,
      progress: links ? `${links} linked` : 'none',
      value: Math.min(100, links * 50),
      why: 'Google joins your shop page to profiles it already knows; buyers check Instagram before they trust a new shop.',
      how: 'Paste the links in Settings - Your shop on the web.',
      href: '/seller/settings#web',
      minutes: 2,
    },
    {
      key: 'location',
      gate: 'Maps',
      world: 'shopmaster',
      level: 'essential',
      title: 'Show your city on your shop page',
      done: Boolean(seller && seller.showLocation && city),
      progress: seller && seller.showLocation ? city || 'no city yet' : 'hidden',
      value: seller && seller.showLocation && city ? 100 : 0,
      why: 'A city is trust - a real shop in a real place - and it is what "near me" and "in Jaipur" searches need. Only the city shows, never the address.',
      how: 'Settings - Your shop on the web - Show my city.',
      href: '/seller/settings#web',
      minutes: 1,
    },
    {
      key: 'reviews',
      gate: 'Maps',
      world: 'shopmaster',
      level: 'essential',
      title: 'Ask every delivered customer for a review',
      done: reviews >= 10,
      progress: `${reviews} review${reviews === 1 ? '' : 's'}`,
      value: Math.min(100, pct(reviews, 10)),
      why: 'Stars in Google results come from reviews; a shop with ten beats one with two in the same search. Only delivered customers can review here, so every one is real.',
      how: 'After delivery, send the product link on WhatsApp with the message below.',
      href: '/seller/orders?tab=delivered',
      minutes: 1,
    },
    {
      key: 'video',
      world: 'shopmaster',
      level: 'optional',
      title: 'A short video on your best sellers',
      done: videos >= 1,
      progress: `${videos} product${videos === 1 ? '' : 's'} with video`,
      value: Math.min(100, videos * 34),
      why: 'Google shows a video thumbnail in results for pages that have one; on the page, a twenty-second clip answers "how does it look worn".',
      how: 'On the product: upload a clip or paste a YouTube link.',
      href: '/seller/products',
      minutes: 5,
    },
    {
      key: 'promotion',
      world: 'shopmaster',
      level: 'optional',
      title: 'Run one promotion',
      done: coupons >= 1,
      progress: coupons ? `${coupons} live` : 'none live',
      value: coupons ? 100 : 0,
      why: 'Google Shopping shows the discount tag under your product; a live code is the cheapest visibility there is.',
      how: 'Promotions - New coupon. It reaches Google overnight.',
      href: '/seller/promotions',
      minutes: 2,
    },
    {
      key: 'faqs',
      world: 'shopmaster',
      level: 'optional',
      title: 'Two answers under every product',
      done: n > 0 && withFaqs === n,
      progress: `${withFaqs} of ${n}`,
      value: pct(withFaqs, n),
      why: 'Google\'s AI answers and the assistants people ask ("is this real silver?") quote pages that answer plainly. Two short answers per product is enough.',
      how: 'Open a product → "Questions shoppers ask" → Draft 3 with AI, then keep them in your words.',
      href: '/seller/products',
      minutes: 3,
    },
    {
      key: 'gbp',
      gate: 'Maps',
      world: 'google',
      level: 'essential',
      title: 'Your own Google Business Profile',
      done: Boolean(gbp),
      progress: gbp ? 'linked' : 'not linked',
      value: gbp ? 100 : 0,
      why: 'Free, and it is how a shop appears on Google Maps and in the box on the right of a search. Reviews there count separately from ours. Ten minutes once; a photo a week after.',
      how: 'Follow the guide below, then paste the profile link in Settings.',
      href: '/seller/settings#web',
      minutes: 10,
      external: true,
    },
  ];
};

exports.sellerGrow = async (req, res) => {
  try {
    const sellerId = req.user._id;
    const [seller, products] = await Promise.all([
      Seller.findOne({ userId: sellerId }).lean(),
      Product.find({ sellerId, isActive: true, isDeleted: { $ne: true } }).populate('category', 'name').lean(),
    ]);
    const [reviews, coupons] = await Promise.all([
      Review.countDocuments({ productId: { $in: products.map((p) => p._id) } }),
      Coupon.countDocuments({ fundedBy: 'seller', sellerId, isActive: true, $or: [{ validUntil: null }, { validUntil: { $gte: new Date() } }] }),
    ]);
    const scored = products.map((p) => ({ ...p, score: scoreListing({ ...p, category: (p.category && p.category._id) || p.category }).score }));
    const steps = stepsFor({ seller, products, scored, reviews, coupons });
    const done = steps.filter((s) => s.done).length;

    // Market insights (plan 2.20): Google's benchmark price per product and
    // this week's best sellers in the seller's categories - when Google has
    // switched the reports on (it does so itself, with traffic).
    let market = { enabled: false, reason: 'not connected', prices: [], bestSellers: [] };
    try {
      const { marketInsights, priceVsMarket } = require('../utils/google/marketInsights');
      const m = await marketInsights();
      const mine = new Set(products.map((p) => (p.category && p.category.name) || '').filter(Boolean));
      market = {
        enabled: m.enabled,
        reason: m.reason || null,
        fetchedAt: m.fetchedAt,
        prices: products.map((p) => ({ productId: p._id, name: p.name, price: p.price, ...(priceVsMarket(p, m.prices) || {}) })).filter((x) => x.benchmark),
        bestSellers: m.bestSellers.filter((b) => !mine.size || [...mine].some((c) => b.category.toLowerCase().includes(c.toLowerCase().split(' ')[0]))).slice(0, 10),
      };
    } catch {
      /* the page still shows the ten steps */
    }
    /*
     * The two worlds and the fields (15 Sep 2026 - Rajat: "essentials + optional,
     * kya website se hoga, kya Google pe, kiska kya faeda"). One list the
     * page draws; the product form and Settings are where each is filled.
     */
    const fields = [
      { field: 'Title: what it is + material or colour + who it is for (4+ words)', level: 'essential', gate: 'Google', where: 'Product form', gives: 'Search match; the title Google Shopping shows', href: '/seller/products' },
      { field: 'Three photos, the first on a clean background', level: 'essential', gate: 'Google', where: 'Product form', gives: 'Shopping listing needs one; three earn the click', href: '/seller/products' },
      { field: 'Category (the last level)', level: 'essential', gate: 'Google', where: 'Product form', gives: "Google's own product category in the feed - where it appears", href: '/seller/products' },
      { field: 'Price and stock', level: 'essential', gate: 'Google', where: 'Product form', gives: 'The feed refuses a product without them', href: '/seller/products' },
      { field: 'Colour; size for clothing and footwear; who it is for', level: 'essential', gate: 'Google', where: 'Product form', gives: 'Shopping filters; Google rejects clothing without size', href: '/seller/products' },
      { field: 'Description, 80+ words, in short paragraphs', level: 'essential', gate: 'Google', where: 'Product form', gives: 'Rank; the text AI answers read', href: '/seller/products' },
      { field: 'Return promise (return / exchange / none)', level: 'essential', gate: 'Policy', where: 'Product form', gives: 'Shown under the price in Google; Fair Returns', href: '/seller/products' },
      { field: 'Packed weight', level: 'essential', gate: 'Courier', where: 'Product form', gives: 'The courier quote - not Google, but the sale', href: '/seller/products' },
      { field: 'Search words - the G and S chips', level: 'optional', where: 'Product form → Suggest search words', gives: 'Real searches from Google and ShopMaster added to your listing', href: '/seller/products' },
      { field: 'Questions shoppers ask (2-6)', level: 'optional', where: 'Product form → Draft 3 with AI', gives: 'AI Overviews and assistants quote plain answers', href: '/seller/products' },
      { field: 'Brand or your item code', level: 'optional', where: 'Product form', gives: 'Identity in the feed', href: '/seller/products' },
      { field: 'Show your city; name it in About; pickup address', level: 'essential', gate: 'Maps', where: 'Settings', gives: '"Near me" - local results rank on distance', href: '/seller/settings' },
      { field: 'Google Business Profile link; Instagram', level: 'essential', gate: 'Maps', where: 'Settings → Your shop on the web', gives: 'Maps + the box on the right of a search; sameAs for Google', href: '/seller/settings#web' },
      { field: 'Ask for a review after delivery (the message below)', level: 'essential', gate: 'Maps', where: 'WhatsApp, after each delivery', gives: 'Stars in search results; the biggest local factor', href: '/seller/grow' },
    ];
    const outside = [
      { task: 'Claim the Business Profile; right category, hours, phone, 5+ photos', level: 'essential', gate: 'Maps', gives: 'Maps, "near me", calls - the single biggest free asset', href: 'https://business.google.com' },
      { task: 'Reviews: 2 → 30, and reply to each', level: 'essential', gate: 'Maps', gives: '47% of people skip a shop under 20 reviews', href: 'https://business.google.com' },
      { task: 'One post a week on the profile (a product, a festival)', level: 'optional', gives: 'Freshness; it shows in the profile and Maps', href: 'https://business.google.com' },
      { task: 'Same name, phone and address on Instagram / Justdial / profile', level: 'optional', gives: 'Consistency is a local ranking signal', href: null },
      { task: 'Products on the profile', level: 'auto', gives: 'Appear on their own once the platform links Merchant Center to your profile', href: null },
    ];
    res.json({
      fields,
      outside,
      market,
      products: products.length,
      score: Math.round(steps.reduce((t, s) => t + (s.value || 0), 0) / steps.length),
      done,
      total: steps.length,
      next: steps.find((s) => !s.done) || null,
      steps,
      shopUrl: `${process.env.FRONTEND_URL || 'https://www.shopmasterpro.in'}/sellers/${sellerId}`,
      businessName: (seller && seller.businessName) || '',
      /*
       * EVERYTHING THE WHATSAPP BUSINESS SETUP NEEDS, ALREADY FILLED IN
       * (27 Sep 2026, Rajat setting his mother's shop up at 1am: "poora
       * setup kar do catalog ka jisse mujhe dikkat na aae... site pe UI pe
       * system").
       *
       * WhatsApp's own catalogue has no import - every item is typed on a
       * phone, and a seller typing a name, a price and a 100-character URL
       * six times will get one of them wrong. The shop already knows all of
       * it. So the panel hands over each field ready to copy, and the LINK
       * is the product's own page here: an order that arrives through the
       * catalogue link is a real order with a record, a courier booking and
       * returns cover, where one agreed in a chat is not.
       *
       * Only live, in-stock items go: a catalogue that offers something out
       * of stock is worse than a shorter one.
       */
      catalogue: products
        .filter((p) => (p.stock || 0) > 0 && (p.images || []).length)
        .sort((a, b) => (b.images || []).length - (a.images || []).length)
        .slice(0, 30)
        .map((p) => ({
          name: p.name,
          // WhatsApp's own "Add item" form: Price is the struck-out one and
          // Sale Price is what is charged, so an MRP above our price maps to
          // Price=mrp / Sale=price. Without an MRP there is only one number,
          // and inventing a struck-out price to make a discount look bigger
          // is the thing Legal Metrology and Google both call out.
          price: p.mrp && p.mrp > p.price ? p.mrp : p.price,
          salePrice: p.mrp && p.mrp > p.price ? p.price : null,
          sku: p.sku || '',
          // Required on that form, and we already hold it (Consumer
          // Protection E-Commerce Rules 6(5) made us).
          origin: p.countryOfOrigin || 'India',
          // Plain text: the form takes 5000 characters and no HTML.
          description: String(p.description || '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 600),
          photos: (p.images || []).length,
          url: `${process.env.FRONTEND_URL || 'https://www.shopmasterpro.in'}/products/${p.slug || p._id}`,
        })),
      shop: {
        phone: (seller && seller.pickupAddress && seller.pickupAddress.phone) || (seller && seller.phone) || '',
        city: (seller && seller.pickupAddress && seller.pickupAddress.city) || '',
        /*
         * What this shop actually sells, in its own categories - so the
         * generated WhatsApp description can say "necklaces, earrings and
         * rings" instead of the empty "quality products" every generated
         * profile on the internet says. Ordered by how many listings sit in
         * each, so the shop leads with what it is known for.
         */
        sells: Object.entries(
          products.reduce((n, p) => {
            const c = p.category && p.category.name;
            if (c) n[c] = (n[c] || 0) + 1;
            return n;
          }, {})
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name]) => name),
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

module.exports.stepsFor = stepsFor;
