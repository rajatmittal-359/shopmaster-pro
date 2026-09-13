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

  return [
    {
      key: 'listings',
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
      key: 'gbp',
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
    res.json({
      market,
      products: products.length,
      score: Math.round(steps.reduce((t, s) => t + (s.value || 0), 0) / steps.length),
      done,
      total: steps.length,
      next: steps.find((s) => !s.done) || null,
      steps,
      shopUrl: `${process.env.FRONTEND_URL || 'https://www.shopmasterpro.in'}/sellers/${sellerId}`,
      businessName: (seller && seller.businessName) || '',
    });
  } catch (error) {
    sendError(res, error);
  }
};

module.exports.stepsFor = stepsFor;
