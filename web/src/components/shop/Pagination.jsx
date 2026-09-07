import Link from 'next/link';
import { shopHref } from '@/lib/shopUrl';

/**
 * Numbered pages, not infinite scroll.
 *
 * None of the seven competitors uses pure infinite scroll, and there is a
 * harder reason: a crawler does not scroll. Page 2 of the catalogue has to be a
 * URL something can follow, or everything past the first page is invisible to
 * search - which for a shop this size is most of the shop.
 */
export default function Pagination({ params, page, totalPages }) {
  if (totalPages <= 1) return null;

  // A window around the current page. Fifty numbered links is not navigation.
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  const link = (n, label, rel) => (
    <Link
      key={label}
      href={shopHref(params, { page: n })}
      rel={rel}
      className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
    >
      {label}
    </Link>
  );

  return (
    <nav aria-label="Pages" className="mt-10 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && link(page - 1, 'Previous', 'prev')}

      {numbers.map((n) =>
        n === page ? (
          <span
            key={n}
            aria-current="page"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            {n}
          </span>
        ) : (
          <Link
            key={n}
            href={shopHref(params, { page: n })}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {n}
          </Link>
        )
      )}

      {page < totalPages && link(page + 1, 'Next', 'next')}
    </nav>
  );
}
