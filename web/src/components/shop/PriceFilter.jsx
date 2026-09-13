'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { shopHref } from '@/lib/shopUrl';

/**
 * Price - a range you drag, with the two numbers under it.
 *
 * Amazon moved to a slider in 2023, Myntra and Flipkart have had one for
 * years: dragging says "roughly this much" the way a shopper thinks; typing
 * two numbers asks them to know the catalogue. Both are here - the slider
 * for the gesture, the boxes for a precise number - and they stay in step.
 *
 * NO LIBRARY. Two native range inputs on one track, the higher one on top;
 * the fill between the thumbs is a plain div. Keyboard and screen readers
 * get the native controls for free. Applies when the thumb is let go, or
 * on Enter in a box - never on every pixel, which would reload the page
 * forty times per drag.
 *
 * The ends are the real cheapest and dearest in the current view (from the
 * server), so the slider describes what the shop holds.
 */
const fmt = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const STEP = (max) => (max > 20000 ? 250 : max > 5000 ? 100 : 50);

export default function PriceFilter({ params, range }) {
  const router = useRouter();
  const lo = Math.max(0, Math.floor(Number(range?.min) || 0));
  const hi = Math.max(lo + 1, Math.ceil(Number(range?.max) || lo + 1));
  const step = STEP(hi);
  const [open, setOpen] = useState(true);
  const [min, setMin] = useState(params.minPrice ? Number(params.minPrice) : lo);
  const [max, setMax] = useState(params.maxPrice ? Number(params.maxPrice) : hi);

  // A new view (category change) brings new ends: the parent keys this
  // component on them, so it remounts with fresh thumbs - no effect needed.

  const pct = useMemo(() => {
    const span = hi - lo || 1;
    return { a: ((Math.min(min, max) - lo) / span) * 100, b: ((Math.max(min, max) - lo) / span) * 100 };
  }, [min, max, lo, hi]);

  const apply = (a = min, b = max) => {
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    router.push(shopHref(params, { minPrice: from > lo ? from : '', maxPrice: to < hi ? to : '' }));
  };

  const on = Boolean(params.minPrice || params.maxPrice);

  return (
    <section className="border-b pb-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between py-1 text-left">
        <span className="text-[0.8rem] font-semibold tracking-wide uppercase">
          Price
          {on && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[0.65rem] font-semibold text-brand-ink normal-case">1</span>}
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3">
          <div className="mb-2 flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>{fmt(Math.min(min, max))}</span>
            <span>{fmt(Math.max(min, max))}</span>
          </div>

          <div className="relative h-5">
            <div className="absolute top-1/2 right-0 left-0 h-1 -translate-y-1/2 rounded-full bg-muted" />
            <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-ink" style={{ left: `${pct.a}%`, right: `${100 - pct.b}%` }} />
            <input
              type="range"
              min={lo}
              max={hi}
              step={step}
              value={Math.min(min, max)}
              onChange={(e) => setMin(Number(e.target.value))}
              onMouseUp={() => apply()}
              onTouchEnd={() => apply()}
              onKeyUp={(e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && apply()}
              aria-label="Lowest price"
              className="range-thumb absolute inset-0 w-full appearance-none bg-transparent"
            />
            <input
              type="range"
              min={lo}
              max={hi}
              step={step}
              value={Math.max(min, max)}
              onChange={(e) => setMax(Number(e.target.value))}
              onMouseUp={() => apply()}
              onTouchEnd={() => apply()}
              onKeyUp={(e) => ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && apply()}
              aria-label="Highest price"
              className="range-thumb absolute inset-0 w-full appearance-none bg-transparent"
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
            className="mt-3 flex items-center gap-2"
          >
            <label className="flex flex-1 items-center gap-1 rounded-md border bg-background px-2 text-xs text-muted-foreground focus-within:border-brand-ink">
              ₹
              <input
                value={min}
                onChange={(e) => setMin(Number(e.target.value.replace(/\D/g, '')) || lo)}
                inputMode="numeric"
                aria-label="Lowest price, typed"
                className="h-8 w-full bg-transparent text-sm text-foreground outline-none tabular-nums"
              />
            </label>
            <span className="text-xs text-muted-foreground">to</span>
            <label className="flex flex-1 items-center gap-1 rounded-md border bg-background px-2 text-xs text-muted-foreground focus-within:border-brand-ink">
              ₹
              <input
                value={max}
                onChange={(e) => setMax(Number(e.target.value.replace(/\D/g, '')) || hi)}
                inputMode="numeric"
                aria-label="Highest price, typed"
                className="h-8 w-full bg-transparent text-sm text-foreground outline-none tabular-nums"
              />
            </label>
            <button type="submit" className="h-8 rounded-md border px-2.5 text-xs font-medium hover:bg-accent">
              Go
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
