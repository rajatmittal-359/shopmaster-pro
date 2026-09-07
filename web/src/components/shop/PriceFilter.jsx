'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { shopHref } from '@/lib/shopUrl';

/**
 * The only filter that cannot be a link: it takes two numbers.
 *
 * The placeholders are the REAL cheapest and dearest in the current view, so
 * the box says what the shop actually holds instead of asking the shopper to
 * guess a range and find nothing in it.
 */
export default function PriceFilter({ params, range }) {
  const router = useRouter();
  const [min, setMin] = useState(params.minPrice || '');
  const [max, setMax] = useState(params.maxPrice || '');

  const apply = (e) => {
    e.preventDefault();
    router.push(shopHref(params, { minPrice: min, maxPrice: max }));
  };

  return (
    <section>
      <h2 className="font-semibold">Price</h2>
      <form onSubmit={apply} className="mt-2 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={min}
            onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder={range ? String(range.min) : 'Min'}
            aria-label="Lowest price"
            className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
          <span className="text-muted-foreground">to</span>
          <input
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder={range ? String(range.max) : 'Max'}
            aria-label="Highest price"
            className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          Apply
        </button>
      </form>
    </section>
  );
}
