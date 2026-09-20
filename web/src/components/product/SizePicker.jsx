import Link from 'next/link';
import Image from 'next/image';

/**
 * The other colours and sizes of the same thing.
 *
 * WHY EACH VARIANT IS ITS OWN PAGE
 *   Google models a variant as a separate item with its own id, grouped by
 *   `item_group_id`, so each colour/size is its own product row here too -
 *   which also means each has its own URL, its own stock and its own price,
 *   and can be linked to and indexed on its own. The picker is therefore a set
 *   of LINKS, not a control: no JavaScript, and a crawler follows every one.
 *
 * COLOUR AS A PHOTO, SIZE AS A LABEL (21 Sep 2026)
 *   Amazon and Myntra show colours as small photos of the piece and sizes as
 *   labelled boxes; a colour name alone ("Rust") sells nothing. So a group
 *   that differs by colour gets a row of thumbnails, one that differs by size
 *   gets the boxes, and a group with both gets both rows.
 *
 * WHY SOLD-OUT VARIANTS ARE STILL SHOWN
 *   Hiding them reads as "they never made it", and the shopper goes looking
 *   elsewhere for a size we simply do not have today. Shown-but-unavailable
 *   ends the search here, and it is what every large shop does.
 */
const availableOf = (v) => Math.max(0, (v.stock || 0) - (v.reserved || 0));

const boxClass = (current, available) =>
  current
    ? 'border-primary bg-primary/10 font-medium'
    : available > 0
      ? 'border-border hover:border-primary'
      : // Legible, but plainly not a choice: line-through says "we have it,
        // not today" where grey alone says "broken link".
        'border-border text-muted-foreground line-through';

export default function SizePicker({ variants, currentId }) {
  const all = variants || [];
  if (all.length < 2) return null;
  const isCurrent = (v) => String(v._id) === String(currentId);
  const current = all.find(isCurrent);

  // One entry per colour (the first row of each), only when colours differ.
  const colours = [];
  for (const v of all) {
    if (!v.color) continue;
    const key = v.color.trim().toLowerCase();
    if (!colours.some((c) => c.key === key)) colours.push({ key, label: v.color.trim(), variant: v });
  }
  const showColours = colours.length >= 2;

  // Sizes within the current colour (or all, when colour is not what varies).
  const sizePool = showColours && current?.color ? all.filter((v) => (v.color || '').trim().toLowerCase() === current.color.trim().toLowerCase()) : all;
  const sizes = sizePool.filter((v) => v.size);
  const showSizes = sizes.length >= 2;

  if (!showColours && !showSizes) return null;

  return (
    <div className="space-y-4">
      {showColours && (
        <div>
          <p className="text-sm font-medium">
            Colour{current?.color ? <span className="font-normal text-muted-foreground"> · {current.color}</span> : null}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {colours.map(({ key, label, variant }) => {
              const cur = (current?.color || '').trim().toLowerCase() === key;
              const src = variant.images?.[0]?.url || variant.images?.[0];
              return (
                <li key={key}>
                  <Link
                    href={`/products/${variant.slug || variant._id}`}
                    aria-current={cur ? 'true' : undefined}
                    title={label}
                    className={`block overflow-hidden rounded-md border-2 transition ${cur ? 'border-primary' : 'border-border hover:border-primary'} ${availableOf(variant) > 0 ? '' : 'opacity-50'}`}
                  >
                    {src ? (
                      <Image src={src} alt={label} width={56} height={56} className="size-14 object-cover" unoptimized />
                    ) : (
                      <span className="flex size-14 items-center justify-center px-1 text-center text-[0.65rem] leading-tight">{label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showSizes && (
        <div>
          <p className="text-sm font-medium">Size</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {sizes.map((variant) => (
              <li key={variant._id}>
                <Link
                  href={`/products/${variant.slug || variant._id}`}
                  aria-current={isCurrent(variant) ? 'true' : undefined}
                  className={`block min-w-12 rounded-md border px-3 py-2 text-center text-sm transition ${boxClass(isCurrent(variant), availableOf(variant))}`}
                >
                  {variant.size}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
