import Link from 'next/link';
import Image from 'next/image';
import { priceOf } from '@/lib/pricing';

/**
 * One product in a grid. A server component - a card has nothing to react to.
 *
 * The price comes from priceOf(), the same function the product page and the
 * cart use, so a card can never advertise a number the next page contradicts.
 *
 * `glow-hover` rather than a grey shadow: a shadow in the brand colour says
 * "this is live", where a grey one only says "this is raised". It is the
 * shared class, so every card on the site lights the same way.
 */
export default function ProductCard({ product, sizes = '(max-width: 768px) 50vw, 25vw' }) {
  const { price, was, percentOff } = priceOf(product);
  const image = product.images?.[0];

  return (
    <Link
      href={`/products/${product.slug || product._id}`}
      className="glow-hover group block overflow-hidden rounded-xl border border-border"
    >
      <div className="relative aspect-square bg-muted">
        {image ? (
          <Image
            src={image}
            alt={product.name}
            fill
            sizes={sizes}
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
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
      </div>
    </Link>
  );
}
