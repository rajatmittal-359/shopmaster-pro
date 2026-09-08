'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, ChevronDown } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSession } from '@/lib/session';

/**
 * The way into everything, on a phone.
 *
 * WHY IT EXISTS
 *   The category strip along the top scrolls sideways, which is the right
 *   pattern for a flat taxonomy - but ours is two levels deep and the second
 *   level only opened on hover. A phone has no hover, so "Earrings" was
 *   unreachable from the navigation on the device most of this shop's visitors
 *   use. The shop page's filters had them; the navigation did not.
 *
 * WHY NOT EVERYTHING IN HERE
 *   Nielsen Norman and Baymard agree, and it is one of the better-replicated
 *   findings in this field: what is hidden behind a hamburger gets used far
 *   less - often less than half as often as the same link left in plain sight.
 *   So the header keeps Shop, Cart and the account within reach, and this holds
 *   what does not fit: the category tree, and the pages nobody visits twice.
 *
 * WHY AN ACCORDION AND NOT A SLIDING PANEL
 *   Two levels is exactly where an accordion still reads. Three or more needs a
 *   panel with a back arrow, and we do not have three - the category model is
 *   capped at two on purpose.
 *
 * WHY NO BOTTOM TAB BAR
 *   It is the other pattern the research recommends for 3-5 primary sections,
 *   and it would sit exactly where the product page's sticky add-to-cart bar
 *   already is. Between a bar that navigates and a bar that sells, the one that
 *   sells wins.
 */
export default function MobileNav({ categories = [] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const { signedIn, canSell, isAdmin } = useSession();

  const shown = categories.filter((c) => c.productCount > 0);
  const close = () => setOpen(false);

  const link = 'block rounded-md px-3 py-2.5 text-sm hover:bg-accent';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-label="Menu" className="-ml-1 rounded-md p-2 hover:bg-accent md:hidden">
        <Menu className="h-5 w-5" />
      </SheetTrigger>

      <SheetContent side="left" className="w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Browse</SheetTitle>
        </SheetHeader>

        <nav className="px-2 pb-8">
          <Link href="/shop" onClick={close} className={`${link} font-medium`}>
            Everything
          </Link>

          <ul className="mt-1">
            {shown.map((cat) => {
              const children = (cat.children || []).filter((c) => c.productCount > 0);
              const isOpen = expanded === cat._id;

              return (
                <li key={cat._id}>
                  <div className="flex items-center">
                    {/* The parent is a LINK, not only a toggle. Shoppers expect
                        the heading itself to be tappable, and a category that
                        merely expands makes them hunt for "all of it". */}
                    <Link
                      href={`/shop?category=${cat.slug}`}
                      onClick={close}
                      className={`${link} flex-1`}
                    >
                      {cat.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        ({cat.productCount})
                      </span>
                    </Link>

                    {children.length > 0 && (
                      <button
                        type="button"
                        aria-label={`Show what is inside ${cat.name}`}
                        aria-expanded={isOpen}
                        onClick={() => setExpanded(isOpen ? null : cat._id)}
                        className="rounded-md p-2 hover:bg-accent"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}
                  </div>

                  {isOpen && children.length > 0 && (
                    <ul className="mb-1 ml-3 border-l border-border pl-2">
                      {children.map((child) => (
                        <li key={child._id}>
                          <Link
                            href={`/shop?category=${child.slug}`}
                            onClick={close}
                            className={`${link} text-muted-foreground`}
                          >
                            {child.name}
                            <span className="ml-1.5 text-xs">({child.productCount})</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="my-3 h-px bg-border" />

          {signedIn ? (
            <>
              <Link href="/orders" onClick={close} className={link}>
                My orders
              </Link>
              <Link href="/wishlist" onClick={close} className={link}>
                Saved items
              </Link>
              <Link href="/addresses" onClick={close} className={link}>
                Addresses
              </Link>
              {canSell && (
                <Link href="/seller" onClick={close} className={link}>
                  Seller dashboard
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin" onClick={close} className={link}>
                  Admin
                </Link>
              )}
            </>
          ) : (
            <>
              <Link href="/login" onClick={close} className={`${link} font-medium`}>
                Sign in
              </Link>
              <Link href="/sell" onClick={close} className={link}>
                Sell on ShopMaster Pro
              </Link>
            </>
          )}

          <div className="my-3 h-px bg-border" />

          <Link href="/contact" onClick={close} className={`${link} text-muted-foreground`}>
            Contact us
          </Link>
          <Link href="/shipping-policy" onClick={close} className={`${link} text-muted-foreground`}>
            Delivery
          </Link>
          <Link href="/refund-policy" onClick={close} className={`${link} text-muted-foreground`}>
            Returns
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
