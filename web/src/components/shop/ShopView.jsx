import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeller } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';
import Stars from '@/components/product/Stars';
import { Globe, MapPin, Link2, Camera, Video, MessageCircle } from 'lucide-react';
import { serialiseJsonLd } from '@/lib/jsonLd';
import { buildShopSchema, safeHref, shopPath } from '@/lib/shopSchema';

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
 *   "<shop name> Jaipur" is a real search, and so is a seller's own brand
 *   name once they have one. A page that answers it belongs to us rather than
 *   to a directory site.
 */
const since = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/**
 * THE CITY GOES IN THE TITLE (29 Sep 2026)
 *
 *   The title was the shop's name and nothing else, which answers the search
 *   "charming jewels" and no other. What people actually type was measured
 *   rather than guessed: Google's own autocomplete for "jewellery shop near
 *   me" returns "jewellery shop jaipur" first, and every shop query in that
 *   list carries a city or a locality. A shop's name on its own is the one
 *   search nobody makes until they already know the shop.
 *
 *   It stays GENERIC on purpose. No trade word is added here - what a shop
 *   sells belongs in the seller's own About, which the seller writes, not in
 *   a template that would tell Google the same thing about a shop selling
 *   shoes. Same rule the site frame follows (layout.js).
 */
export async function shopMetadata(handle) {
  const data = await getSeller(handle);

  if (!data?.seller) return { title: 'Shop not found' };

  const { businessName, city, about, productCount } = data.seller;

  return {
    title: city ? `${businessName}, ${city.city}` : businessName,
    description: about || `${businessName} sells on ShopMaster Pro - ${productCount} products, delivered across India with 7-day returns.`,
    alternates: { canonical: shopPath(data.seller) },
  };
}

export default async function ShopView({ handle }) {
  const data = await getSeller(handle);

  // Before anything renders: an unapproved or suspended shop is a 404, and a
  // 404 has to be a real one.
  if (!data?.seller) notFound();

  const { seller, products } = data;

  const shopSchema = buildShopSchema(seller, SITE);

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

      {/*
        WHO IS STANDING HERE, AND WHY THE PAGE IS ORDERED THIS WAY (30 Sep 2026)

          This is where the Google Business Profile's "Website" button lands, so
          most arrivals have just read the shop's name, rating and hours in the
          panel and tapped through. They came to see what the shop sells.

          Until today the first screen on a phone was seven blocks of text -
          name, three meta lines, the About, two link chips, the seller-of-record
          line and the whole returns paragraph - and not one product. Rajat, on
          his own phone: people do not read that much and leave.

          The research agrees and is not close. NN/g: 79% of users scan rather
          than read, and more than 42% of viewing time goes to the top 20% of a
          page whatever its length. Baymard is blunter - on mobile the buying
          content belongs above long brand copy, and anything that pushes the
          primary content off the first screen is a navigation failure.

          So the page now repeats the shape the visitor just used in the panel:
          NAME -> the few facts that decide trust -> the actions -> the goods.
          Everything that answers "who is behind this shop" - the About, the
          legal line, who carries the returns - is real and stays, but it moved
          under the products, which is where somebody who wants it will look.
      */}
      <header className="rounded-xl border border-border p-5 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{seller.businessName}</h1>
        {seller.break && (
          <p className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
            <strong>On a break{seller.break.untilText ? ` until ${seller.break.untilText}` : ''}.</strong> {seller.break.note || 'Products are hidden until then; orders open again the day after.'}
          </p>
        )}

        {/* The panel's own three facts, in the panel's own order. "Selling here
            since" is trust detail rather than a deciding fact, so it moved down
            with the rest of the story. */}
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

          {seller.city && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> {seller.city.city}
              {seller.city.state ? `, ${seller.city.state}` : ''}
            </span>
          )}
        </div>

        {/*
          THE ACTION ROW - one line, the way the profile panel does it

            CHAT ON WHATSAPP IS HERE AND NEVER ON A PRODUCT PAGE (27 Sep 2026)
            An order agreed inside a chat has no order record, no courier
            booking and no returns cover, so the button must never sit beside a
            Buy button competing with it. On the SHOP page it does the opposite
            job: this is where a shopper decides whether a stranger in Jaipur is
            real, and being able to ask is exactly what settles that. Amazon,
            Flipkart and Meesho all keep seller chat off the buy path.

            `wa.me` is a plain link - no WhatsApp Business API, no per-message
            bill. The number is opt-in: a seller types it in Settings knowing it
            will be public, and it is never taken from the pickup address, which
            is a courier contact.
        */}
        {(seller.whatsapp || Object.keys(seller.links || {}).length > 0) && (
          <ul className="mt-4 flex flex-wrap items-center gap-2">
            {seller.whatsapp && (
              <li>
                <a
                  href={`https://wa.me/${seller.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-600/10 px-3.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-600/20 dark:text-emerald-300"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  Chat on WhatsApp
                </a>
              </li>
            )}
            {Object.entries(seller.links || {}).map(([key, url]) => {
              const Icon = LINK_ICON[key] || Globe;
              const href = safeHref(url);
              if (!href) return null;
              return (
                <li key={key}>
                  {/* min-h-11 is 44px: the customer-side touch floor in the
                      project checklist, and what iOS asks for. `py-2` alone
                      gave 36px, which passes WCAG's 24px web minimum and fails
                      ours - the stricter rule is the one that holds. gap-2 on
                      the row is the 8px these need between them. */}
                  <a href={href} target="_blank" rel="noopener noreferrer me" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3.5 text-sm text-muted-foreground transition hover:border-brand-ink hover:text-brand-ink">
                    <Icon className="size-4" /> {LINK_LABEL[key] || key}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
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

      {/*
        WHO IS BEHIND THIS SHOP - kept in full, moved under the goods

          None of this is decoration. The seller-of-record line is what the
          Consumer Protection (E-Commerce) Rules 2020 ask a marketplace to show
          (plan 2.40) - legal name and GST standing - and Amazon and Flipkart
          print the same on a seller profile. The returns line answers the one
          question a stranger actually has about buying from somebody they have
          never heard of. Both are read by people who have already decided to
          look, which is why they read better here than in front of the stock.
      */}
      <section className="mt-10 rounded-xl border border-border p-5 sm:p-6">
        <h2 className="text-lg font-semibold">About this shop</h2>

        {seller.about && <p className="mt-3 max-w-[65ch] text-sm leading-relaxed">{seller.about}</p>}

        {seller.sellingSince && (
          <p className="mt-3 text-sm text-muted-foreground">Selling here since {since(seller.sellingSince)}.</p>
        )}

        {seller.legal && (
          <p className="mt-3 text-xs text-muted-foreground">
            Sold by {seller.legal.name}
            {seller.legal.address ? <> · {seller.legal.address}</> : null}
            {seller.legal.gstin ? <> · GSTIN <span className="font-mono">{seller.legal.gstin}</span></> : seller.legal.enrolled ? ` · GST-enrolled seller, ships within ${seller.legal.enrolled}` : ' · not registered under GST'}
            {' · '}Complaints: <Link href="/contact" className="text-brand-ink hover:underline">grievance officer</Link>
          </p>
        )}

        <p className="mt-3 max-w-[65ch] text-sm text-muted-foreground">
          Orders from this shop are delivered by ShopMaster Pro, with the same{' '}
          <Link href="/refund-policy" className="text-brand-ink hover:underline">
            returns and refunds
          </Link>{' '}
          as everything else here. If something goes wrong and the seller cannot
          put it right, we decide.
        </p>
      </section>
    </div>
  );
}
