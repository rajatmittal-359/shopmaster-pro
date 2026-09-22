import Link from 'next/link';
import Image from 'next/image';
import { priceOf } from '@/lib/pricing';
import CardActions from '@/components/product/CardActions';
import Stars from '@/components/product/Stars';

/**
 * One product in a grid. A server component - the card itself has nothing
 * to react to; the one interactive piece, quick add, is its own small client
 * island so the grid stays server-rendered.
 *
 * The price comes from priceOf(), the same function the product page and the
 * cart use, so a card can never advertise a number the next page contradicts.
 *
 * `glow-hover` rather than a grey shadow: a shadow in the brand colour says
 * "this is live", where a grey one only says "this is raised". It is the
 * shared class, so every card on the site lights the same way.
 *
 * E2 (22 Sep 2026), from the card research (Myntra, Zara, Meesho, Amazon):
 *   - the SECOND photograph fades in on hover - the back, the worn shot,
 *     the scale - which answers the first question without a click;
 *   - a rating line when there are reviews (Amazon and Flipkart never leave
 *     it off a card; a card without it reads as unsold);
 *   - Add to cart + Buy now under the price (CardActions; Rajat 22 Sep:
 *     "bahar bhi" - the hover "+" was invisible on a phone).
 * The whole card is still one link; the buttons sit beside it, not inside.
 */
export default function ProductCard({ product, sizes = '(max-width: 768px) 50vw, 25vw' }) {
  const { price, was, percentOff } = priceOf(product);
  const [image, second] = product.images || [];
  const href = `/products/${product.slug || product._id}`;
  const available = Math.max(0, (product.stock || 0) - (product.reserved || 0));
  const reviews = Number(product.totalReviews) || 0;

  return (
    <div className="glow-hover group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <Link href={href} className="block flex-1 focus-visible:outline-none">
        <div className="relative aspect-square bg-muted">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes={sizes}
              className={`object-cover transition duration-300 ${second ? 'group-hover:opacity-0' : 'group-hover:scale-[1.03]'}`}
            />
          ) : null}
          {second ? (
            <Image
              src={second}
              alt=""
              fill
              sizes={sizes}
              loading="lazy"
              className="object-cover opacity-0 transition duration-300 group-hover:opacity-100"
            />
          ) : null}
        </div>

        <div className="p-3">
          <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
          <p className="mt-1 text-sm">
            <span className="font-semibold">₹{price.toLocaleString('en-IN')}</span>
            {was ? (
              <>
                <span className="ml-2 text-muted-foreground line-through">
                  ₹{was.toLocaleString('en-IN')}
                </span>
                <span className="ml-2 text-brand-ink">{percentOff}% off</span>
              </>
            ) : null}
          </p>
          {reviews > 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Stars value={Number(product.avgRating) || 0} className="text-[0.7rem]" />
              <span>{(Number(product.avgRating) || 0).toFixed(1)} · {reviews}</span>
            </p>
          ) : null}
        </div>
      </Link>

      <div className="mt-auto px-3 pb-3">
        <CardActions productId={product._id} name={product.name} price={price} href={href} inStock={available > 0} />
      </div>
    </div>
  );
}
