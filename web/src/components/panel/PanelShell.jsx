'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PanelLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import PanelNav from '@/components/panel/PanelNav';
import Logo from '@/components/brand/Logo';
import HeaderAccount from '@/components/layout/HeaderAccount';
import RoleSwitch from '@/components/layout/RoleSwitch';
import ThemeToggle from '@/components/layout/ThemeToggle';

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
export default function PanelShell({ title, groups, children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-muted/30">
      {/* THE PANEL'S OWN BAR */}
      <header className="glass sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
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
              <div className="px-3 py-4">
                <PanelNav groups={groups} onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Link href={title === 'Admin' ? '/admin' : '/seller'} className="flex items-center gap-2.5" aria-label={`${title} home`}>
            <Logo />
          </Link>
          <span className="hidden rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-brand-ink sm:inline">
            {title}
          </span>

          <div className="ml-auto flex items-center gap-1 text-sm">
            {/* The same switch the storefront header carries: Shopping |
                Selling | Admin, the current one lit. Replaces "View shop". */}
            <RoleSwitch />
            <HeaderAccount showCart={false} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <PanelNav groups={groups} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
