'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PanelLeft, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import PanelNav from '@/components/panel/PanelNav';
import Logo from '@/components/brand/Logo';
import HeaderAccount from '@/components/layout/HeaderAccount';
import RoleSwitch from '@/components/layout/RoleSwitch';
import ThemeToggle from '@/components/layout/ThemeToggle';
import LangToggle from '@/components/panel/LangToggle';
import AssistDrawer from '@/components/assist/AssistDrawer';
import { useDock, setDock } from '@/lib/assistDock';

/**
 * The frame around the seller panel and the admin panel - its OWN frame.
 *
 * WHAT WAS WRONG
 *   The panels sat inside the storefront: the shop's header, the category
 *   strip and the shop's footer, and then a sidebar under all of it. Half a
 *   shop, half a dashboard. Rajat: "seller ki tarah dekhna hai to seller
 *   wali cheezein hi dikhengi na."
 *
 * THE PATTERN, FROM THE REFERENCES
 *   Shopify's admin, Amazon Seller Central, Meesho's supplier panel - every
 *   one is a separate application: a slim top bar with the mark, the panel's
 *   name, a way to the live shop, and the account; a sidebar; the work. No
 *   categories, no search box, no "sell with us", no footer of policies. A
 *   person running a shop is not shopping, and everything that helps a
 *   shopper is noise to them.
 *
 * WHY "VIEW SHOP" AND NOT "BACK TO THE SHOP"
 *   Same account, same cart - the capability model - so the shop is one click
 *   away. But it opens as a destination, not a return: the panel is home
 *   while you are working.
 *
 * WHY THE SIDEBAR IS GROUPED AND ALWAYS VISIBLE
 *   Section 4.12. Below `lg` it becomes a drawer behind one button.
 */
export default function PanelShell({ title, groups, countsUrl = null, identity = null, children }) {
  const [open, setOpen] = useState(false);
  const dock = useDock();
  const role = title === 'Admin' ? 'admin' : 'seller';

  return (
    <div className="min-h-dvh bg-muted/30 print:bg-white">
      {/* THE PANEL'S OWN BAR */}
      <header className="glass sticky top-0 z-40 border-b print:hidden">
        {/* gap-2 and a shrinkable logo on a phone: at 360 px the row used to
            push the icon group 7 px past the edge, which is a page that scrolls
            sideways (checklist: no horizontal scroll at 390). */}
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
          {/* Phone: the drawer */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="flex size-9 items-center justify-center rounded-md hover:bg-accent lg:hidden"
              aria-label={`Open the ${title.toLowerCase()} menu`}
            >
              <PanelLeft className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle>{title}</SheetTitle>
              </SheetHeader>
              <div className="flex h-[calc(100dvh-3.5rem)] flex-col px-3 py-4">
                {/* On a phone the header cannot hold the role switch and the language
                    chips (15 Sep 2026: together they pushed every panel page 300 px
                    sideways). They live here, at the top of the menu. */}
                <div className="mb-3 flex flex-wrap items-center gap-2 md:hidden">
                  <RoleSwitch />
                  {title === 'Seller' && <LangToggle compact />}
                </div>
                {identity}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]">
                  <PanelNav groups={groups} onNavigate={() => setOpen(false)} countsUrl={countsUrl} />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Link href={title === 'Admin' ? '/admin' : '/seller'} className="flex min-w-0 shrink items-center gap-2.5 overflow-hidden" aria-label={`${title} home`}>
            <Logo />
          </Link>
          <span className="hidden rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-brand-ink sm:inline">
            {title}
          </span>

          <div className="ml-auto flex shrink-0 items-center gap-1 text-sm">
            {/* The same switch the storefront header carries: Shopping |
                Selling | Admin, the current one lit. Replaces "View shop". */}
            <div className="hidden items-center gap-1 md:flex">
              <RoleSwitch />
              {title === 'Seller' && <LangToggle compact />}
            </div>
            {/* Ask ShopMaster as a drawer beside the page (plan 2.33) - the answer stays while the person follows it. */}
            <button
              type="button"
              onClick={() => setDock(dock === 'open' ? 'min' : 'open')}
              aria-pressed={dock === 'open'}
              aria-label="Ask ShopMaster"
              className={`inline-flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${dock === 'open' ? 'text-brand-from' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Sparkles className="size-5" />
            </button>
            <HeaderAccount showCart={false} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 print:max-w-none print:p-0">
        <aside className="hidden w-60 shrink-0 lg:block print:hidden">
          {/* Full height so "pinned" groups (Settings, Help) can sit at the bottom the way Shopify's do. */}
          <div className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col">
            {identity}
            {/* The list scrolls on a short screen; the identity card stays. Without
                this the pinned Settings group was simply clipped below the fold
                (Rajat, 15 Sep: "sidebar me Settings kahan hai, neeche nahi ja pa raha"). */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:var(--color-border)_transparent]">
              <PanelNav groups={groups} countsUrl={countsUrl} />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <AssistDrawer role={role} />
    </div>
  );
}
