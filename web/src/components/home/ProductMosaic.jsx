import Link from 'next/link';
import Image from 'next/image';

/**
 * A wall of real product photographs.
 *
 * WHY THIS EXISTS
 *   Rajat's point, and it is the right one: most people do not read. If a
 *   screen is visually interesting they stay and THEN read; if it opens on a
 *   paragraph they leave. So the first thing on the home page, and the whole
 *   left half of the sign-in screen, is now the goods - not a description of
 *   them. Meesho, Myntra and Nykaa all open on imagery for exactly this
 *   reason.
 *
 * WHY REAL PRODUCTS AND NOT A STOCK ILLUSTRATION
 *   These are live listings, so the wall changes as the catalogue does and it
 *   is never a photo of something the shop does not sell. Each tile is a link,
 *   so the first thing a visitor sees is also the first thing they can buy.
 *
 * THE STAGGER
 *   The middle column is pushed down by half a tile. Three even columns read
 *   as a spreadsheet; one column offset reads as a collage, and it costs one
 *   class.
 */
export default function ProductMosaic({ products = [], className = '', priority = false }) {
  const tiles = products.filter((p) => p.images?.[0]).slice(0, 6);
  if (tiles.length < 3) return null;

  return (
    <div className={`grid grid-cols-3 gap-3 ${className}`} aria-label="Products on ShopMaster Pro">
      {tiles.map((product, i) => (
        <Link
          key={product._id}
          href={`/products/${product.slug || product._id}`}
          className={`glow-hover relative block aspect-square overflow-hidden rounded-2xl bg-muted ring-1 ring-white/10 ${
            i % 3 === 1 ? 'translate-y-6' : ''
          }`}
        >
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(max-width: 1024px) 30vw, 200px"
            priority={priority && i < 3}
            className="object-cover transition duration-500 hover:scale-105"
          />
        </Link>
      ))}
    </div>
  );
}
