import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getReviews, getRelated, getSimilar } from '@/lib/api';
import { priceOf } from '@/lib/pricing';
import { serialiseJsonLd } from '@/lib/jsonLd';
import { faqSchema, productSchema, breadcrumbSchema } from '@/lib/productSchema';
import { POLICY, BUSINESS } from '@/config/policy';
import Gallery from '@/components/product/Gallery';
import BuyBox from '@/components/product/BuyBox';
import ShareButtons from '@/components/product/ShareButtons';
import TrackView from '@/components/analytics/TrackView';
import PincodeCheck from '@/components/product/PincodeCheck';
import ProductCard from '@/components/product/ProductCard';
import Stars from '@/components/product/Stars';
import ReviewForm from '@/components/product/ReviewForm';
import SizePicker from '@/components/product/SizePicker';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';

/** Description text is stored as light HTML; the tags are stripped for meta. */
const plain = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) return { title: 'Product not found' };

  const { price } = priceOf(product);
  const path = `/products/${product.slug || product._id}`;

  return {
    title: product.name,
    description: plain(product.description).slice(0, 160),
    alternates: { canonical: path },
    openGraph: {
      title: product.name,
      description: plain(product.description).slice(0, 200),
      url: `${SITE}${path}`,
      type: 'website',
      siteName: 'ShopMaster Pro',
      locale: 'en_IN',
      // A product without a photo still gets the brand card, not a bare link.
      images: product.images?.length ? [{ url: product.images[0] }] : ['/opengraph-image'],
    },
    other: { 'product:price:amount': String(price), 'product:price:currency': 'INR' },
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  // An old /products/<mongo id> URL is sent to the slug by src/proxy.js before
  // anything renders (a redirect from here would arrive after the loading
  // shell has already streamed a 200). The canonical below covers the rest.

  /*
   * BEFORE any JSX is returned. Once the response starts streaming it is
   * committed to 200, and a notFound() after that cannot become a 404 - Next
   * injects a noindex meta instead, and its own docs warn that crawlers may
   * treat those as soft 404s.
   */
  if (!product) notFound();

  const { price, was, percentOff, wasIsMrp } = priceOf(product);
  const available = Math.max(0, (product.stock || 0) - (product.reserved || 0));
  const inStock = product.isActive && available > 0;
  const path = `/products/${product.slug || product._id}`;

  // Fetched after the product exists, and deliberately not inside Suspense:
  // both are small, and nothing a crawler needs may sit behind a boundary.
  const [reviews, related, similar] = await Promise.all([
    getReviews(product._id),
    getRelated(product.category?.slug, product._id),
    getSimilar(product._id).catch(() => []),
  ]);

  const crumbs = [
    { name: 'Home', url: `${SITE}/` },
    { name: 'Shop', url: `${SITE}/shop` },
    ...(product.category
      ? [{ name: product.category.name, url: `${SITE}/shop?category=${product.category.slug}` }]
      : []),
    { name: product.name, url: `${SITE}${path}` },
  ];

  // The seller's Q&A (plan 2.32) - shown, and marked up when there are at least two.
  const faqs = (product.faqs || []).filter((x) => x && x.q && x.a);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 pb-28 md:pb-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serialiseJsonLd(
            productSchema({ product, url: `${SITE}${path}`, price, was, inStock })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(breadcrumbSchema(crumbs)) }}
      />
      {faqs.length >= 2 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialiseJsonLd(faqSchema(faqs)) }} />
      )}

      {/* The trail, shown as well as marked up. Google made breadcrumb rich
          results desktop-only in 2025; the value now is that a visitor who
          landed here from search can see where they are. */}
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-brand-ink">Home</Link>
        <span className="mx-1.5">/</span>
        <Link href="/shop" className="hover:text-brand-ink">Shop</Link>
        {product.category && (
          <>
            <span className="mx-1.5">/</span>
            <Link
              href={`/shop?category=${product.category.slug}`}
              className="hover:text-brand-ink"
            >
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <Gallery images={product.images} video={product.video} name={product.name} facts={[product.color, product.material, product.category?.name].filter(Boolean).join(', ')} />

        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
            {/* A link, not a label. On a marketplace the seller is who the
                shopper is actually buying from, and until this page existed
                they had nowhere to go to find out who that is. */}
            <p className="mt-1 text-sm text-muted-foreground">
              {/* The SHOP's name, never the owner's - Etsy and Amazon both;
                  and the owner's name on every product would say which shop
                  the platform runs. `shop` comes from the API (utils/shopNames). */}
              Sold by{' '}
              {product.shop?.id ? (
                <Link href={`/sellers/${product.shop.id}`} className="text-brand-ink hover:underline">
                  {product.shop.name || 'this seller'}
                </Link>
              ) : (
                product.shop?.name || BUSINESS.legalName
              )}
            </p>
          </div>

          <div>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-semibold">₹{price.toLocaleString('en-IN')}</span>
              {was ? (
                <>
                  <span className="text-lg text-muted-foreground line-through">
                    ₹{was.toLocaleString('en-IN')}
                  </span>
                  <span className="font-medium text-brand-ink">{percentOff}% off</span>
                </>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Inclusive of all taxes
              {wasIsMrp ? ' · struck-through price is the maximum retail price' : ''}
            </p>
          </div>

          {/* Sizes, if this style has more than one. Links, not a control -
              each size is its own row, its own URL and its own stock. */}
          <SizePicker variants={product.variants} currentId={product._id} />

          {product.totalReviews > 0 && (
            <p className="flex items-center gap-2 text-sm">
              <Stars value={product.avgRating} />
              <span className="font-medium">{Number(product.avgRating).toFixed(1)}</span>
              <a href="#reviews" className="text-muted-foreground hover:text-brand-ink">
                {product.totalReviews} review{product.totalReviews === 1 ? '' : 's'}
              </a>
            </p>
          )}

          {/* Only when it is genuinely low. "Only 12 left" on a shelf of 12 is
              the manufactured urgency the CCPA guidelines call a dark pattern. */}
          {inStock && available <= (product.lowStockThreshold || 3) && (
            <p className="text-sm font-medium text-destructive">Only {available} left</p>
          )}

          {/* Made to order (Etsy's "ready to ship in"): said before the price is paid, not in a mail after. */}
          {Number.isInteger(product.processingDays) && (
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Made to order</strong> · ready to ship in {product.processingDays} working day{product.processingDays === 1 ? '' : 's'}, then the courier&rsquo;s time.
            </p>
          )}

          {/* The shop's own words while it is on a break (Etsy's "taking a short break"). */}
          {product.shop?.break && (
            <p className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
              <strong>{product.shop.name || 'This shop'} is on a break{product.shop.break.untilText ? ` until ${product.shop.break.untilText}` : ''}.</strong>
              {product.shop.break.note ? ` ${product.shop.break.note}` : ' You can save this to your wishlist and order when they are back.'}
            </p>
          )}

          <PincodeCheck productId={product._id} />

          <TrackView product={{ _id: product._id, name: product.name, price, brand: product.shop?.name, category: product.category }} />
          <BuyBox
            productId={product._id}
            name={product.name}
            price={price}
            inStock={inStock}
            maxQuantity={available}
            shopBreak={product.shop?.break || null}
            /* Handed down rather than read from window.location in the client:
               the two disagreed, which is a hydration mismatch on every product
               page. */
            returnTo={`/products/${product.slug || product._id}`}
          />

          {/* The product travels on WhatsApp - the OG card above is what arrives. */}
          <ShareButtons url={`${SITE}/products/${product.slug || product._id}`} name={product.name} price={price} />

          {/* Baymard: 60% of shoppers look for the return policy ON the product
              page, 15% abandon over an unsatisfactory one - and 44% of sites do
              not link it from the product content. Cheapest fix in the plan. */}
          <ul className="space-y-1.5 border-t border-border pt-4 text-sm text-muted-foreground">
            {/* Fair Returns (plan §4.39): THIS item's promise - R, X or N - said
                before anyone buys. A wrong or damaged item is covered whatever
                the mode; the policy page has the matrix. */}
            <li>
              <Link href="/refund-policy" className="text-brand-ink hover:underline">
                {product.returnMode === 'N'
                  ? 'No change-of-mind returns on this item'
                  : product.returnMode === 'X'
                    ? `${POLICY.returnDays}-day exchange only`
                    : `${POLICY.returnDays}-day returns`}
              </Link>{' '}
              {product.returnMode === 'N'
                ? '(hygiene / custom) - wrong, damaged or faulty is always covered'
                : product.returnMode === 'X'
                  ? 'from delivery, for size or colour - wrong or damaged is refunded'
                  : 'from delivery, or exchange for the same piece'}
            </li>
            <li>
              <Link href="/shipping-policy" className="text-brand-ink hover:underline">
                Delivered across India
              </Link>
              {product.freeShipping ? ' · free delivery on this piece' : ''}
            </li>
            {/*
              No material claim here. This list is on EVERY product, and the
              marketplace also carries other sellers' clothing and gift boxes -
              "imitation jewellery, nickel-free, skin safe" printed under a
              hamper is a false statement about somebody else's stock. What a
              piece is made of belongs in its own description and in the
              details table below, where it is written per product.
            */}
          </ul>
        </div>
      </div>

      {product.description && (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-lg font-semibold">About this piece</h2>
          {/*
            The description is stored as a small allow-list of tags and is
            refused at save time if it contains anything else - see
            backend/utils/safeHtml.js. That is what makes this safe to render.
          */}
          <div
            className="mt-3 space-y-3 text-[15px] leading-7 text-muted-foreground [&_li]:ml-5 [&_li]:list-disc"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />

          <dl className="mt-6 grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-3">
            {[
              ['Size', product.size],
              ['Colour', product.color],
              ['Category', product.category?.name],
              ['Item code', product.sku],
              ['Weight', product.weight ? `${product.weight} g` : null],
              // The law's lines (E-Commerce Rules 2020 rule 6(5); Legal Metrology rule 6(10)).
              ['Country of origin', product.countryOfOrigin || 'India'],
              ['Net quantity', product.netQuantity],
              ['Manufacturer / packer', product.manufacturer],
            ]
              .filter(([, v]) => v)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="mt-12 max-w-3xl">
          <h2 className="text-lg font-semibold">Questions shoppers ask</h2>
          <p className="mt-1 text-sm text-muted-foreground">Answered by the seller.</p>
          <dl className="mt-4 divide-y rounded-xl border">
            {faqs.map((x) => (
              <div key={x.q} className="px-4 py-3">
                <dt className="font-medium">{x.q}</dt>
                <dd className="mt-1 text-[15px] leading-7 text-muted-foreground">{x.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section id="reviews" className="mt-12 max-w-3xl scroll-mt-20">
        <h2 className="text-lg font-semibold">
          Reviews{' '}
          {reviews.length > 0 && (
            <span className="text-muted-foreground">({reviews.length})</span>
          )}
        </h2>

        {/*
          Said once, above the reviews, because it is TRUE of every one of them:
          the API refuses a review from anybody without a delivered order
          containing this product. Every marketplace trust guide names
          verified-purchase flags specifically, and the strongest version of
          that flag is not a badge on some reviews - it is the sentence that
          applies to all of them.
        */}
        <p className="mt-2 text-sm text-muted-foreground">
          Only people who bought this and received it can review it.
        </p>

        {/* Who is looking decides whether a form appears; the server cannot
            know, so this island asks. Everything else here stays server-drawn. */}
        <ReviewForm productId={product.slug || String(product._id)} />

        {reviews.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No reviews yet. The first five matter more than every one after them,
            so if you buy this, please write one.
          </p>
        ) : (
          <>
            {/* The distribution, not only the average. Northwestern's Spiegel
                research found purchase likelihood PEAKS around 4.0-4.7 stars
                and falls towards 5.0 - a perfect score reads as fake, and
                hiding the spread is what makes it read that way. */}
            <div className="mt-4 space-y-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = reviews.filter((r) => Math.round(r.rating) === star).length;
                const pct = Math.round((count / reviews.length) * 100);
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-muted-foreground">{star} star</span>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>

            <ul className="mt-6 space-y-6">
              {reviews.slice(0, 10).map((r) => (
                <li key={r._id} className="border-b border-border pb-6 last:border-0">
                  <div className="flex items-center gap-2">
                    <Stars value={r.rating} />
                    <span className="text-sm font-medium">{r.userId?.name || 'A customer'}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Verified purchase
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                  {r.comment && (
                    <p className="mt-1 text-[15px] leading-7 text-muted-foreground">
                      {r.comment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Amazon's "Customers who viewed this also viewed", at our size: the
          nearest products by meaning (plan 2.21), before the category list. */}
      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">You may also like</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pieces close to this one - style, material, occasion.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {similar.slice(0, 8).map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">
            More from {product.category?.name || 'the shop'}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
