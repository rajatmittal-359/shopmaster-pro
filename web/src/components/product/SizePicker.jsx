import Link from 'next/link';

/**
 * The other sizes of the same thing.
 *
 * WHY EACH SIZE IS ITS OWN PAGE
 *   Google models a variant as a separate item with its own id, grouped by
 *   `item_group_id`, so each size is its own product row here too - which also
 *   means each has its own URL, its own stock and its own price, and can be
 *   linked to and indexed on its own. The picker is therefore a set of LINKS,
 *   not a control: no JavaScript, and a crawler follows every size.
 *
 * WHY SOLD-OUT SIZES ARE STILL SHOWN
 *   Hiding them reads as "they never made it", and the shopper goes looking
 *   elsewhere for a size we simply do not have today. Shown-but-unavailable
 *   ends the search here, and it is what every large shop does.
 */
export default function SizePicker({ variants, currentId }) {
  const sizes = (variants || []).filter((v) => v.size);
  if (sizes.length < 2) return null;

  return (
    <div>
      <p className="text-sm font-medium">Size</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {sizes.map((variant) => {
          const available = Math.max(0, (variant.stock || 0) - (variant.reserved || 0));
          const current = String(variant._id) === String(currentId);

          const classes = current
            ? 'border-primary bg-primary/10 font-medium'
            : available > 0
              ? 'border-border hover:border-primary'
              : // Legible, but plainly not a choice: line-through says "we
                // have it, not today" where grey alone says "broken link".
                'border-border text-muted-foreground line-through';

          return (
            <li key={variant._id}>
              <Link
                href={`/products/${variant.slug || variant._id}`}
                aria-current={current ? 'true' : undefined}
                className={`block min-w-12 rounded-md border px-3 py-2 text-center text-sm transition ${classes}`}
              >
                {variant.size}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
