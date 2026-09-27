import { POLICY, BUSINESS } from '@/config/policy';

/**
 * The Product structured data.
 *
 * THE RULE THAT GOVERNS ALL OF IT
 *   Never let a fact exist ONLY in here. searchVIU put eight prices in eight
 *   places on one page and asked five AI systems to find them; the price that
 *   lived only in JSON-LD was found by none of them. Schema earns rich results
 *   and feeds Merchant Center. It does not talk to AI - visible text does. So
 *   every value below is also on the page in words a person can read.
 *
 * THE OTHER RULE
 *   It must not promise more than the policy pages do. The returns claim here
 *   was once `FreeReturn` while the returns page said the customer pays the
 *   courier on a change of mind. Both are read by Google, and the difference
 *   between them is the kind a payment aggregator calls misrepresentation.
 */
/**
 * The return policy Google is told, per product, matching the fair-returns
 * matrix the product page already prints in words (plan §4.39).
 *
 * WHY THIS IS NOT ONE FIXED BLOCK (27 Sep 2026)
 *   It used to be: a seven-day window with `returnFees: ReturnShippingFees`
 *   on every product. Two things were wrong with that.
 *
 *   It was too harsh. Google was told the customer pays the courier on every
 *   return, when a wrong, damaged or not-as-described item has always been
 *   free to send back - that is the law, not a courtesy. Google publishes
 *   `itemDefectReturnFees` for exactly this, and saying it costs us nothing
 *   and is true.
 *
 *   And it was too generous. A hygiene item - earrings, nose pins - is mode
 *   N: no change-of-mind return at all. The page says so; the schema
 *   promised seven days anyway. A promise that lives only in the markup is
 *   the kind a payment aggregator calls misrepresentation.
 *
 *   `returnShippingFeesAmount` is what Google asks for whenever fees are
 *   declared, and its absence is a warning in Search Console. The figure is
 *   representative, like `shippingRate`: the same courier, going back.
 */
const returnPolicy = (product) => {
  const mode = product.returnMode || 'R';
  const base = {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: POLICY.shippingCountry,
    returnMethod: 'https://schema.org/ReturnByMail',
    // Always free, whatever the mode: a faulty item is the seller's problem.
    itemDefectReturnFees: 'https://schema.org/FreeReturn',
  };

  if (mode === 'N') {
    // No voluntary return. The statutory right to send back a faulty item
    // survives and is stated above; a window and a fee would both be lies.
    return { ...base, returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted' };
  }

  const fee = { '@type': 'MonetaryAmount', value: POLICY.returnShippingRate, currency: 'INR' };
  return {
    ...base,
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: POLICY.returnDays,
    // X is exchange-only; only R gives the money back.
    refundType: mode === 'X' ? 'https://schema.org/ExchangeRefund' : 'https://schema.org/FullRefund',
    returnFees: 'https://schema.org/ReturnShippingFees',
    returnShippingFeesAmount: fee,
    customerRemorseReturnFees: 'https://schema.org/ReturnShippingFees',
    customerRemorseReturnShippingFeesAmount: fee,
  };
};

export const productSchema = ({ product, url, price, was, inStock }) => {
  // The brand Google sees is the seller's shop, not the person who owns it.
  const brand = product.brand || product.shop?.name || BUSINESS.tradeName;
  const [handleMin, handleMax] = POLICY.handlingDays;
  const [transitMin, transitMax] = POLICY.transitDays;

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description?.replace(/<[^>]*>/g, '').slice(0, 5000),
    image: product.images?.length ? product.images : undefined,
    sku: product.sku || undefined,
    mpn: product.sku || undefined,
    brand: { '@type': 'Brand', name: brand },
    color: product.color || undefined,
    category: product.category?.name || undefined,

    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'INR',
      price: price.toFixed(2),
      // Google reads a missing validity as "may already be wrong". A year out
      // is honest for a shop that changes prices by hand.
      priceValidUntil: new Date(Date.now() + 365 * 24 * 3600 * 1000)
        .toISOString()
        .slice(0, 10),
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      // A marketplace listing names the shop that sells it, the way Amazon's
      // does; the marketplace is the platform, not the seller.
      seller: { '@type': 'Organization', name: product.shop?.name || BUSINESS.tradeName },

      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: product.freeShipping ? 0 : POLICY.shippingRate,
          currency: 'INR',
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: POLICY.shippingCountry,
        },
        deliveryTime: {
          '@type': 'ShippingDeliveryTime',
          handlingTime: {
            '@type': 'QuantitativeValue',
            minValue: handleMin,
            maxValue: handleMax,
            unitCode: 'DAY',
          },
          transitTime: {
            '@type': 'QuantitativeValue',
            minValue: transitMin,
            maxValue: transitMax,
            unitCode: 'DAY',
          },
        },
      },

      hasMerchantReturnPolicy: returnPolicy(product),
    },
  };

  // A product video is worth a VideoObject: it is what earns the video
  // thumbnail in results, and Google reads the YouTube id straight from it.
  if (product.video?.url) {
    schema.video = {
      '@type': 'VideoObject',
      name: `${product.name} - video`,
      description: schema.description || product.name,
      thumbnailUrl: product.video.poster || undefined,
      uploadDate: product.updatedAt || product.createdAt || undefined,
      ...(product.video.youtubeId
        ? { embedUrl: `https://www.youtube-nocookie.com/embed/${product.video.youtubeId}`, contentUrl: product.video.url }
        : { contentUrl: product.video.url }),
    };
  }

  // Only when reviews genuinely exist. An aggregateRating with a count of zero
  // is a structured-data error, and an invented one is worse than an error.
  if (product.totalReviews > 0 && product.avgRating > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: Number(product.avgRating).toFixed(1),
      reviewCount: product.totalReviews,
    };
  }

  return schema;
};

/**
 * The breadcrumb.
 *
 * Google made breadcrumb rich results desktop-only in January 2025, so this is
 * not chasing a snippet - it is a hierarchy signal, and it matches the trail
 * shown on the page, which is where the value actually is.
 */
export const breadcrumbSchema = (crumbs) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    item: c.url,
  })),
});

/**
 * The seller's Q&A as FAQPage (plan 2.32). Google stopped showing FAQ rich
 * results for most sites in 2023; the markup still tells AI overviews and
 * assistants which sentence answers which question, and costs nothing.
 */
export const faqSchema = (faqs) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((x) => ({
    '@type': 'Question',
    name: x.q,
    acceptedAnswer: { '@type': 'Answer', text: x.a },
  })),
});
