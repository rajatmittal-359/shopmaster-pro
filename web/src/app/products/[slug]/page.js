import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getReviews, getRelated } from '@/lib/api';
import { priceOf } from '@/lib/pricing';
import { serialiseJsonLd } from '@/lib/jsonLd';
import { productSchema, breadcrumbSchema } from '@/lib/productSchema';
import { POLICY, BUSINESS } from '@/config/policy';
import Gallery from '@/components/product/Gallery';
import BuyBox from '@/components/product/BuyBox';
import PincodeCheck from '@/components/product/PincodeCheck';
import ProductCard from '@/components/product/ProductCard';
import Stars from '@/components/product/Stars';
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
      images: product.images?.length ? [{ url: product.images[0] }] : undefined,
    },
    other: { 'product:price:amount': String(price), 'product:price:currency': 'INR' },
  };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const product = await getProduct(slug);

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
  const [reviews, related] = await Promise.all([
    getReviews(product._id),
    getRelated(product.category?.slug, product._id),
  ]);

  const crumbs = [
    { name: 'Home', url: `${SITE}/` },
    { name: 'Shop', url: `${SITE}/shop` },
    ...(product.category
      ? [{ name: product.category.name, url: `${SITE}/shop?category=${product.category.slug}` }]
      : []),
    { name: product.name, url: `${SITE}${path}` },
  ];

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
        <Gallery images={product.images} name={product.name} />

        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sold by {product.sellerId?.name || BUSINESS.legalName}
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

          <PincodeCheck />

          <BuyBox
            productId={product._id}
            name={product.name}
            price={price}
            inStock={inStock}
            maxQuantity={available}
          />

          {/* Baymard: 60% of shoppers look for the return policy ON the product
              page, 15% abandon over an unsatisfactory one - and 44% of sites do
              not link it from the product content. Cheapest fix in the plan. */}
          <ul className="space-y-1.5 border-t border-border pt-4 text-sm text-muted-foreground">
            <li>
              <Link href="/refund-policy" className="text-brand-ink hover:underline">
                {POLICY.returnDays}-day returns
              </Link>{' '}
              from delivery, or exchange for the same piece
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

      <section id="reviews" className="mt-12 max-w-3xl scroll-mt-20">
        <h2 className="text-lg font-semibold">
          Reviews{' '}
          {reviews.length > 0 && (
            <span className="text-muted-foreground">({reviews.length})</span>
          )}
        </h2>

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
