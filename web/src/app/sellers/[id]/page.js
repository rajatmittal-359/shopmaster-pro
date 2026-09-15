import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeller } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';
import Stars from '@/components/product/Stars';
import { Globe, MapPin, Link2, Camera, Video } from 'lucide-react';
import { serialiseJsonLd } from '@/lib/jsonLd';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';
// lucide dropped the brand glyphs; plain signifiers do the job.
const LINK_ICON = { instagram: Camera, facebook: Link2, youtube: Video, googleBusiness: MapPin, website: Globe };
const LINK_LABEL = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', googleBusiness: 'On Google Maps', website: 'Website' };

/**
 * A seller, as a place rather than a name.
 *
 * WHY IT EXISTS
 *   On a marketplace the shopper is not buying from us. They are buying from
 *   somebody they have never heard of, and until now we printed that person's
 *   name on a product page and gave them nowhere to go with it. Etsy and eBay
 *   both make the seller a page with a rating and a history, because on a
 *   marketplace that is where trust accumulates - otherwise every product
 *   starts from zero.
 *
 * IT IS INDEXABLE ON PURPOSE
 *   "Charming Jewels Jaipur" is a real search, and so is a seller's own brand
 *   name once they have one. A page that answers it belongs to us rather than
 *   to a directory site.
 */
const since = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export async function generateMetadata({ params }) {
  const { id } = await params;
  const data = await getSeller(id);

  if (!data?.seller) return { title: 'Shop not found' };

  return {
    title: data.seller.businessName,
    description: data.seller.about || `${data.seller.businessName} sells on ShopMaster Pro - ${data.seller.productCount} products, delivered across India with 7-day returns.`,
    alternates: { canonical: `/sellers/${id}` },
  };
}

export default async function SellerPage({ params }) {
  const { id } = await params;
  const data = await getSeller(id);

  // Before anything renders: an unapproved or suspended shop is a 404, and a
  // 404 has to be a real one.
  if (!data?.seller) notFound();

  const { seller, products } = data;

  // The shop as an Organization Google can join to the seller's own profiles
  // (sameAs) - the one line of structured data that is about the SELLER,
  // not the platform. Only what the page shows in words.
  const shopSchema = {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    name: seller.businessName,
    url: `${SITE}/sellers/${seller.id}`,
    ...(seller.about ? { description: seller.about } : {}),
    ...(seller.legal?.name && seller.legal.name !== seller.businessName ? { legalName: seller.legal.name } : {}),
    ...(seller.legal?.gstin ? { taxID: seller.legal.gstin } : {}),
    ...(Object.keys(seller.links || {}).length ? { sameAs: Object.values(seller.links) } : {}),
    ...(seller.city ? { address: { '@type': 'PostalAddress', addressLocality: seller.city.city, addressRegion: seller.city.state || undefined, addressCountry: 'IN' } } : {}),
    ...(seller.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: seller.rating.average, reviewCount: seller.rating.reviews } } : {}),
    parentOrganization: { '@type': 'Organization', name: 'ShopMaster Pro', url: SITE },
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* serialiseJsonLd escapes < > & - the About is seller-written text. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialiseJsonLd(shopSchema) }} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-brand-ink">
          Home
        </Link>
        <span className="mx-1.5">/</span>
        <Link href="/shop" className="hover:text-brand-ink">
          Shop
        </Link>
      </nav>

      <header className="rounded-xl border border-border p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{seller.businessName}</h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {/* A rating is shown only when somebody has actually left one. A shop
              displaying "0.0" reads as bad rather than as new. */}
          {seller.rating ? (
            <span className="flex items-center gap-1.5">
              <Stars value={seller.rating.average} />
              <span className="font-medium text-foreground">{seller.rating.average}</span>
              <span>
                from {seller.rating.reviews} review{seller.rating.reviews === 1 ? '' : 's'}
              </span>
            </span>
          ) : (
            <span>No reviews yet</span>
          )}

          <span>
            {seller.productCount} product{seller.productCount === 1 ? '' : 's'}
          </span>

          {seller.sellingSince && <span>Selling here since {since(seller.sellingSince)}</span>}
          {seller.city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> {seller.city.city}
              {seller.city.state ? `, ${seller.city.state}` : ''}
            </span>
          )}
        </div>

        {/* The seller's own words, and the seller's own profiles. Both are
            what a buyer checks before trusting a shop they have not heard of. */}
        {seller.about && <p className="mt-4 max-w-2xl text-sm leading-relaxed">{seller.about}</p>}
        {Object.keys(seller.links || {}).length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {Object.entries(seller.links).map(([key, url]) => {
              const Icon = LINK_ICON[key] || Globe;
              return (
                <li key={key}>
                  <a href={url} target="_blank" rel="noopener noreferrer me" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-brand-ink hover:text-brand-ink">
                    <Icon className="size-3.5" /> {LINK_LABEL[key] || key}
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {/* Seller of record - the line the Consumer Protection (E-Commerce)
            Rules 2020 ask a marketplace to show (plan 2.40): legal name and
            GST standing. Amazon and Flipkart print the same on a seller's
            profile; a buyer who wants to know who is behind a shop finds it. */}
        {seller.legal && (seller.legal.gstin || seller.legal.enrolled || seller.legal.name !== seller.businessName) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Sold by {seller.legal.name}
            {seller.legal.gstin ? <> · GSTIN <span className="font-mono">{seller.legal.gstin}</span></> : seller.legal.enrolled ? ` · GST-enrolled seller, ships within ${seller.legal.enrolled}` : ''}
          </p>
        )}

        <p className="mt-4 text-sm text-muted-foreground">
          Orders from this shop are delivered by ShopMaster Pro, with the same{' '}
          <Link href="/refund-policy" className="text-brand-ink hover:underline">
            returns and refunds
          </Link>{' '}
          as everything else here. If something goes wrong and the seller cannot
          put it right, we decide.
        </p>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">What they sell</h2>

        {products.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing in stock right now.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
