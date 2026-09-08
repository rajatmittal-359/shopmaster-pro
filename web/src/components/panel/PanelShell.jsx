'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, PanelLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import PanelNav from '@/components/panel/PanelNav';

/**
 * The frame around the seller panel and the admin panel.
 *
 * WHAT WAS THERE BEFORE
 *   A single row of tabs across the top, with no active state - six or seven
 *   links that looked identical on every page. It also wrapped onto two lines
 *   on a laptop as soon as the admin panel grew a seventh section.
 *
 * WHY A SIDEBAR
 *   Every dashboard worth copying uses one - Shopify's admin, Stripe's, Linear,
 *   Vercel - and for the same three reasons, all of which apply here:
 *
 *   1. A vertical list GROWS. Sections can be added without the navigation
 *      reflowing, which a horizontal row cannot promise; the admin panel added
 *      its seventh link and immediately wrapped.
 *   2. It can be GROUPED. "Payouts" and "Orders & disputes" are money and
 *      arguments; "Categories" and "Coupons" are housekeeping. Seven flat links
 *      say none of that; four groups of two say it without a word of
 *      explanation.
 *   3. It is always visible, so "where am I" and "where else can I go" are
 *      answered at the same time - which is the thing a dashboard is asked
 *      constantly and a shop front is not.
 *
 * WHY NOT ON THE SHOP ITSELF
 *   Because a shop is not a dashboard. A shopper wants the products to have the
 *   width; an operator wants the map. Same site, two different jobs.
 *
 * WHY IT BECOMES A DRAWER ON A PHONE
 *   240px of permanent sidebar on a 390px screen is not navigation, it is a
 *   wall. Below `lg` it collapses to one button, which is what every dashboard
 *   in the reference set does at that width.
 */
export default function PanelShell({ title, groups, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6">
      {/* THE SIDEBAR. Sticky, and offset by the height of the site header so it
          pins directly beneath it rather than sliding under it. */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20">
          <p className="mb-3 px-3 text-sm font-semibold">{title}</p>
          <PanelNav groups={groups} />

          {/* Sellers and admins are shoppers too - the capability model means
              the same account keeps its cart while it is in here. The way back
              has to exist, and at the bottom is where every dashboard puts
              it. */}
          <Link
            href="/"
            className="mt-6 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to the shop
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* THE PHONE'S VERSION: one button, and the same nav inside a drawer. */}
        <div className="mb-4 flex items-center gap-3 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              aria-label={`Open the ${title.toLowerCase()} menu`}
            >
              <PanelLeft className="size-4" />
              Menu
            </SheetTrigger>

            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle>{title}</SheetTitle>
              </SheetHeader>

              <div className="px-3 py-4">
                {/* Closing on navigation matters: without it the drawer stays
                    open over the page it just moved to. */}
                <PanelNav groups={groups} onNavigate={() => setOpen(false)} />

                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="mt-6 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground"
                >
                  <ArrowLeft className="size-4" />
                  Back to the shop
                </Link>
              </div>
            </SheetContent>
          </Sheet>

          <p className="text-sm font-semibold">{title}</p>
        </div>

        {children}
      </div>
    </div>
  );
}
