'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { addToCart } from '@/lib/analytics';
import { announceAdded } from '@/lib/cartEvents';
import { Button } from '@/components/ui/button';

/**
 * "Add to cart" and "Buy now" under every product card (Rajat, 22 Sep 2026:
 * "detail page wale me to hota hi hai + bahar bhi"). Amazon India's search
 * results, JioMart and the quick-commerce apps all put the add button on
 * the tile; a hover "+" (E2's first version) is invisible on a phone and
 * missed on a laptop. Two buttons, the same two as the product page's BuyBox,
 * doing the same two things: one into the bag (the drawer opens, the photo
 * flies), the other into the bag and straight to checkout.
 *
 * Each size is its own product row, so there is nothing to choose here.
 * Signed out: both go to sign-in and come back to the product. The admin
 * account is not a shopper: nothing drawn. Out of stock: one quiet line.
 */
export default function CardActions({ productId, name, price, href, inStock }) {
  const router = useRouter();
  const { signedIn, capabilities } = useSession();
  const [busy, setBusy] = useState(''); // '' | 'add' | 'buy'
  const [added, setAdded] = useState(false);
  const adminOnly = Boolean(capabilities?.admin) && !capabilities?.customer;
  if (adminOnly) return null;

  if (!inStock) {
    return <p className="mt-2 text-xs text-muted-foreground">Out of stock</p>;
  }

  const go = async (e, buy) => {
    e.preventDefault();
    e.stopPropagation();
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(buy ? '/checkout' : href)}`);
    if (busy) return undefined;
    setBusy(buy ? 'buy' : 'add');
    try {
      await authedFetch('/customer/cart', { method: 'POST', body: { productId, quantity: 1 } });
      addToCart({ _id: productId, name, price }, 1, price);
      if (buy) return router.push('/checkout');
      const from = e.currentTarget?.closest('.group')?.querySelector('img') || null;
      announceAdded({ productId, name, price, quantity: 1, from });
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
    } catch (err) {
      const { toast } = await import('sonner');
      toast.error(err.message || 'Could not add that just now');
    } finally {
      setBusy('');
    }
    return undefined;
  };

  return (
    <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
      <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy !== ''} onClick={(e) => go(e, false)} aria-label={`Add ${name} to cart`}>
        {busy === 'add' ? 'Adding…' : added ? 'Added' : 'Add to cart'}
      </Button>
      <Button type="button" size="sm" className="w-full" disabled={busy !== ''} onClick={(e) => go(e, true)} aria-label={`Buy ${name} now`}>
        {busy === 'buy' ? 'Opening…' : 'Buy now'}
      </Button>
    </div>
  );
}
