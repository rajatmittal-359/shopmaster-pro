'use client';

import { useRouter } from 'next/navigation';
import { shopHref } from '@/lib/shopUrl';

/**
 * Sorting happens on the SERVER now.
 *
 * It used to reorder whichever page had already been fetched, which is wrong
 * the moment there is more than one page: "price low to high" showed the
 * cheapest of page 1, not of the shop. The five orders here are the five the
 * API allows - anything else it ignores.
 */
const OPTIONS = [
  ['newest', 'Newest first'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
  ['rating', 'Best rated'],
  ['popular', 'Most reviewed'],
];

export default function SortSelect({ params }) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Sort</span>
      <select
        value={params.sort || 'newest'}
        onChange={(e) => router.push(shopHref(params, { sort: e.target.value }))}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
      >
        {OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
