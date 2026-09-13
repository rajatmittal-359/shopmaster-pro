'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import FilterPanel from '@/components/shop/FilterPanel';

/**
 * Filters on a phone: a button beside Sort that opens the same panel in a
 * sheet - Myntra's and Flipkart's app pattern. The button carries how many
 * filters are on, so the shopper knows the grid is narrowed even when the
 * panel is closed. Each option is still a link; picking one navigates and
 * the new page opens with the sheet closed, results in view.
 */
export default function FilterDrawer({ params, ...panel }) {
  const [open, setOpen] = useState(false);
  const many = (v) => String(v || '').split(',').filter(Boolean).length;
  const count = (params.category ? 1 : 0) + many(params.color) + many(params.size) + (params.minRating ? 1 : 0) + (params.minPrice || params.maxPrice ? 1 : 0);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent md:hidden">
        <SlidersHorizontal className="size-4" />
        Filters
        {count > 0 && <span className="rounded-full bg-brand-ink px-1.5 text-[0.65rem] leading-4 font-semibold text-white tabular-nums">{count}</span>}
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="px-4 py-4" onClick={(e) => e.target.closest('a') && setOpen(false)}>
          <FilterPanel params={params} {...panel} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
