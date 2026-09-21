'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { authedFetch } from '@/lib/client';
import { CART_ADDED } from '@/lib/cartEvents';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

/**
 * The bag, as a drawer that opens the moment something goes in (E2, 22 Sep
 * 2026). Zara, Myntra and every Shopify theme do this instead of a toast:
 * the person sees the line they added, the running total, and two ways on -
 * keep shopping (close) or checkout - without leaving the grid. Baymard: a
 * confirmation that shows the cart's contents cuts the "did that work?"
 * revisit to the cart page.
 *
 * Mounted once in the root layout; opens on `smp:cart-added`. Never opens on
 * the cart or checkout pages - there the page itself is the confirmation.
 */
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function CartDrawer() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(null);
  const [cart, setCart] = useState(null);
  // A navigation closes it (the checkout button is a link): the open flag is
  // remembered per path, so a new path starts closed without a setState in an effect.
  const [openedOn, setOpenedOn] = useState(pathname);
  const isOpen = open && openedOn === pathname;
  const setOpenHere = (v) => { setOpenedOn(pathname); setOpen(v); };

  useEffect(() => {
    const onAdded = (e) => {
      if (pathname.startsWith('/cart') || pathname.startsWith('/checkout')) return;
      setAdded(e.detail || null);
      setCart(null);
      setOpenedOn(pathname);
      setOpen(true);
      authedFetch('/customer/cart').then((d) => setCart(d.cart || { items: [], totalAmount: 0 })).catch(() => setCart({ items: [], totalAmount: 0 }));
    };
    window.addEventListener(CART_ADDED, onAdded);
    return () => window.removeEventListener(CART_ADDED, onAdded);
  }, [pathname]);

  const items = (cart?.items || []).filter((i) => i.productId);
  const count = items.reduce((n, i) => n + (i.quantity || 0), 0);

  return (
    <Sheet open={isOpen} onOpenChange={setOpenHere}>
      <SheetContent side="right" className="w-[92vw] max-w-sm p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="font-display text-lg">In your cart</SheetTitle>
          <SheetDescription>{added?.name ? `${added.name} was added.` : 'Added.'}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {!cart && <p className="py-6 text-sm text-muted-foreground">Fetching your cart…</p>}
          {cart && items.length === 0 && <p className="py-6 text-sm text-muted-foreground">Your cart is empty.</p>}
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const p = item.productId;
              return (
                <li key={p._id} className="flex gap-3 py-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {p.images?.[0] && <Image src={p.images[0]} alt="" fill sizes="64px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${p.slug || p._id}`} className="line-clamp-2 text-sm font-medium hover:text-brand-ink">{p.name}</Link>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.quantity} × {rupees(item.price)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="border-t px-5 py-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">{count} item{count === 1 ? '' : 's'}</span>
            <span className="font-semibold">{cart ? rupees(cart.totalAmount) : '—'}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Delivery and any coupon are worked out at checkout.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button render={<Link href="/cart" />} nativeButton={false} variant="outline">View cart</Button>
            <Button render={<Link href="/checkout" />} nativeButton={false}>Checkout</Button>
          </div>
          <button type="button" onClick={() => setOpenHere(false)} className="mt-3 w-full text-center text-sm text-muted-foreground underline-offset-2 hover:underline">
            Keep shopping
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
