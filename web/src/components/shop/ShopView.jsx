import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeller } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';
import Stars from '@/components/product/Stars';
import { Globe, MapPin, Link2, Camera, Video, MessageCircle } from 'lucide-react';
import { serialiseJsonLd } from '@/lib/jsonLd';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';
// lucide dropped the brand glyphs; plain signifiers do the job.
const LINK_ICON = { instagram: Camera, facebook: Link2, youtube: Video, googleBusiness: MapPin, website: Globe };
/*
 * A link is only rendered if it is http(s) (27 Sep 2026, flagged by the
 * security review while this file was being split out).
 *
 * The API already refuses anything else: sellerController parses every link
 * with `new URL` and then matches the HOSTNAME against a per-field pattern,
 * and a `javascript:` or `data:` URL has no hostname to match. So this is
 * not closing an open hole - it is making the page safe on its own, without
 * depending on a validator three files away staying exactly as strict. The
 * page is the last place the string is trusted, so it is the right place to
 * check.
 *
 * It also guards the JSON-LD: `sameAs` is a public claim about the shop, and
 * a junk value there is a different kind of wrong.
 */
const safeHref = (raw) => {
  try {
    const u = new URL(String(raw));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};

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
 *   "<shop name> Jaipur" is a real search, and so is a seller's own brand
 *   name once they have one. A page that answers it belongs to us rather than
 *   to a directory site.
 */
const since = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/**
 * The canonical address of a shop: its short link when it has one, the id
 * URL when it does not. Both routes render this same view, so without one
 * canonical Google would see two pages with identical content and pick for
 * us (27 Sep 2026).
 */
export const shopPath = (seller) => (seller?.slug ? `/${seller.slug}` : `/sellers/${seller?.id}`);

export async function shopMetadata(handle) {
  const data = await getSeller(handle);

  if (!data?.seller) return { title: 'Shop not found' };

  return {
    title: data.seller.businessName,
    description: data.seller.about || `${data.seller.businessName} sells on ShopMaster Pro - ${data.seller.productCount} products, delivered across India with 7-day returns.`,
    alternates: { canonical: shopPath(data.seller) },
  };
}

export default async function ShopView({ handle }) {
  const data = await getSeller(handle);

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
    url: `${SITE}${shopPath(seller)}`,
    ...(seller.about ? { description: seller.about } : {}),
    ...(seller.legal?.name && seller.legal.name !== seller.businessName ? { legalName: seller.legal.name } : {}),
    ...(seller.legal?.gstin ? { taxID: seller.legal.gstin } : {}),
    ...(() => {
      const sameAs = Object.values(seller.links || {}).map(safeHref).filter(Boolean);
      return sameAs.length ? { sameAs } : {};
    })(),
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
        {seller.break && (
          <p className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
            <strong>On a break{seller.break.untilText ? ` until ${seller.break.untilText}` : ''}.</strong> {seller.break.note || 'Products are hidden until then; orders open again the day after.'}
          </p>
        )}

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
        {/*
          CHAT ON WHATSAPP - HERE, AND NEVER ON A PRODUCT PAGE (27 Sep 2026)
            An order agreed inside a chat has no order record, no courier
            booking and no returns cover, so the button must never sit beside
            a Buy button competing with it. On the SHOP page it is doing the
            opposite job: this is where a shopper decides whether a stranger
            in Jaipur is real, and being able to ask a question is exactly
            what settles that. Amazon, Flipkart and Meesho all keep seller
            chat off the buy path for the same reason.

            `wa.me` is a plain link - no WhatsApp Business API, no Gupshup, no
            per-conversation bill. The number is opt-in: a seller types it in
            Settings knowing it will be public, and it is never taken from
            the pickup address, which is a courier contact.
        */}
        {seller.whatsapp && (
          <a
            href={`https://wa.me/${seller.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3.5 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-600/20 dark:text-emerald-300"
          >
            <MessageCircle className="size-4" aria-hidden />
            Chat on WhatsApp
          </a>
        )}

        {Object.keys(seller.links || {}).length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {Object.entries(seller.links).map(([key, url]) => {
              const Icon = LINK_ICON[key] || Globe;
              const href = safeHref(url);
              if (!href) return null;
              return (
                <li key={key}>
                  <a href={href} target="_blank" rel="noopener noreferrer me" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-brand-ink hover:text-brand-ink">
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
        {seller.legal && (
          <p className="mt-3 text-xs text-muted-foreground">
            Sold by {seller.legal.name}
            {seller.legal.address ? <> · {seller.legal.address}</> : null}
            {seller.legal.gstin ? <> · GSTIN <span className="font-mono">{seller.legal.gstin}</span></> : seller.legal.enrolled ? ` · GST-enrolled seller, ships within ${seller.legal.enrolled}` : ' · not registered under GST'}
            {' · '}Complaints: <Link href="/contact" className="text-brand-ink hover:underline">grievance officer</Link>
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
            {seller.break ? 'The products come back when the shop reopens.' : 'Nothing in stock right now.'}
          </p>
        ) : (
          <div className="stagger mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
