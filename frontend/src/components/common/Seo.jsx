import { POLICY } from '../../config/policy';
import { priceOf } from '../../utils/pricing';
import { serialiseJsonLd } from '../../utils/jsonLd';

const SITE_URL = 'https://www.shopmasterpro.in';

/**
 * Per-page document metadata.
 *
 * React 19 hoists <title>, <meta> and <link> into <head> no matter where in the
 * tree they are rendered, so this needs no helmet library and adds no
 * dependency. See react.dev/reference/react-dom/components/meta.
 *
 * Every page should render this. Without it the app served one title and one
 * canonical for every route, which is what stopped product pages being indexed.
 *
 * `jsonLd` is emitted as a script tag; Google accepts JSON-LD in head or body.
 */
export default function Seo({
  title,
  description,
  path = '',
  image,
  noIndex = false,
  jsonLd,
}) {
  const canonical = `${SITE_URL}${path}`;
  const fullTitle = title ? `${title} | ShopMaster Pro` : 'ShopMaster Pro';

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      <link rel="canonical" href={canonical} />
      <meta name="robots" content={noIndex ? 'noindex, nofollow' : 'index, follow'} />

      {/* Link previews on WhatsApp, Instagram and search result cards. */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:url" content={canonical} />
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />

      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serialiseJsonLd(jsonLd) }}
        />
      )}
    </>
  );
}

/**
 * Commercial policy shown to Google in structured data.
 *
 * Google lists shippingDetails and hasMerchantReturnPolicy as RECOMMENDED for
 * merchant listings, and they are what let a result show delivery cost and
 * return terms directly in search. CHECK THESE MATCH YOUR ACTUAL POLICY - they
 * are a public promise to the customer, not decoration.
 */
// POLICY moved to src/config/policy.js: the policy PAGES quote the same
// numbers, and a second copy is exactly how the two drift apart.

/**
 * Product structured data, matching the fields Google lists for merchant
 * listings.
 *
 * REQUIRED    name, image, offers.price, offers.priceCurrency
 * RECOMMENDED brand, sku, description, availability, url, aggregateRating,
 *             shippingDetails, hasMerchantReturnPolicy
 *
 * Verified against developers.google.com/search/docs/appearance/structured-data
 * /merchant-listing. Anything missing simply narrows which result types the
 * page can qualify for.
 */
export function productJsonLd(product, canonicalPath) {
  const inStock = product.stock > 0;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images?.length ? product.images : undefined,
    sku: product.sku || undefined,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,

    /*
     * The clip, declared so search engines know it exists.
     *
     * Without VideoObject markup a product video is just a file on the page -
     * Google cannot show it as a video result, and the AI engines have no way
     * to know the product has one. name, description, thumbnail and
     * uploadDate are the fields Google requires; a VideoObject missing any of
     * them is ignored rather than partly used.
     */
    video: product.video?.url
      ? {
          '@type': 'VideoObject',
          name: `${product.name} — video`,
          description: `A short video of ${product.name}.`,
          thumbnailUrl: product.video.poster || product.images?.[0],
          contentUrl: product.video.url,
          uploadDate: product.updatedAt || product.createdAt,
          duration: product.video.duration
            ? `PT${Math.round(product.video.duration)}S`
            : undefined,
        }
      : undefined,

    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}${canonicalPath}`,

      /*
       * The price actually being charged, which is the sale price while one is
       * running. Advertising one number in search and charging another is the
       * complaint the CCPA fined FirstCry over - and Google delists a shop whose
       * structured data disagrees with its page.
       */
      price: priceOf(product).price,
      priceCurrency: 'INR',
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          // Google surfaces "Free delivery" on a result when this is zero, so
          // a product the seller ships free must say so here, not just at
          // checkout.
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
            minValue: POLICY.handlingDays[0],
            maxValue: POLICY.handlingDays[1],
            unitCode: 'DAY',
          },
          transitTime: {
            '@type': 'QuantitativeValue',
            minValue: POLICY.transitDays[0],
            maxValue: POLICY.transitDays[1],
            unitCode: 'DAY',
          },
        },
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: POLICY.shippingCountry,
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: POLICY.returnDays,
        returnMethod: 'https://schema.org/ReturnByMail',

        /*
         * Both settlements are offered, and Google shows what it is told. A
         * shop that exchanges but only declares refunds loses the customers who
         * were looking for exactly that.
         */
        refundType: [
          'https://schema.org/FullRefund',
          'https://schema.org/ExchangeRefund',
        ],

        /*
         * This said FreeReturn, which the shop's own returns page contradicts:
         * "for a change of mind, the return courier is at your cost". Google
         * reads both, and a structured-data promise the policy page refuses is
         * the mismatch that gets an offer disapproved - quite apart from being
         * a promise the shop was not keeping.
         *
         * A faulty or wrong item is still collected at our expense; schema.org
         * has no way to say "free only when it is our fault", so the stricter
         * of the two is declared and the page explains the exception.
         */
        returnFees: 'https://schema.org/ReturnFeesCustomerResponsibleForShipping',
        returnShippingFeesAmount: {
          '@type': 'MonetaryAmount',
          currency: 'INR',
          value: POLICY.shippingRate,
        },
      },
    },
  };

  if (product.totalReviews > 0 && product.avgRating > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.avgRating,
      reviewCount: product.totalReviews,
    };
  }

  // Drop undefined keys so the emitted JSON stays clean.
  return JSON.parse(JSON.stringify(data));
}
