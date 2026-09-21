import Link from 'next/link';
import { X } from 'lucide-react';
import { shopHref, FILTER_LABELS } from '@/lib/shopUrl';

/**
 * What is currently narrowing the results, each one removable on its own.
 *
 * NOT A COUNT. "3 filters applied" tells a shopper they are being filtered but
 * not by what, so the only way out is to clear everything and start again.
 * Baymard finds 28% of sites do this - 66% on mobile. Each chip here is a link
 * that removes exactly its own filter and keeps the rest.
 */
export default function AppliedFilters({ params, categoryName }) {
  const chips = Object.entries(FILTER_LABELS)
    .filter(([key]) => params[key])
    .map(([key, label]) => ({
      key,
      // The category is stored as a slug and read as a name: "rings" in the URL
      // must not appear as "rings" on a chip when the category is "Rings".
      text: label(key === 'category' ? categoryName || params[key] : params[key]),
    }));
  // The category's facets (attr.plating=Gold Plated): the value reads as itself.
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith('attr.') && value) chips.push({ key, text: String(value).split(',').join(', ') });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={shopHref(params, { [chip.key]: '' })}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/30 bg-primary/10 px-3 py-1 text-xs font-medium text-brand-ink hover:bg-primary/20"
        >
          {chip.text}
          <X aria-hidden="true" className="size-3" />
          <span className="sr-only">Remove this filter</span>
        </Link>
      ))}

      {chips.length > 1 && (
        <Link href="/shop" className="text-xs text-brand-ink hover:underline">
          Clear all
        </Link>
      )}
    </div>
  );
}
