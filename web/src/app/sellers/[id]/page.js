import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeller } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';
import Stars from '@/components/product/Stars';

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
    description: `${data.seller.businessName} sells on ShopMaster Pro - ${data.seller.productCount} products, delivered across India with 7-day returns.`,
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
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
        </div>

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
