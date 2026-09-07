'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { shopHref } from '@/lib/shopUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
          <Input
            value={min}
            onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder={range ? String(range.min) : 'Min'}
            aria-label="Lowest price"
            className="w-20"
          />
          <span className="text-muted-foreground">to</span>
          <Input
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder={range ? String(range.max) : 'Max'}
            aria-label="Highest price"
            className="w-20"
          />
        </div>
        <Button
          type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </form>
    </section>
  );
}
