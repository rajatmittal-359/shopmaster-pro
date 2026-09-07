'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import ProductCard from '@/components/product/ProductCard';
import { Button } from '@/components/ui/button';

/**
 * Saved for later.
 *
 * IT REUSES THE SHOP'S OWN CARD
 *   Same component, same price function. A wishlist that formats prices itself
 *   is a third place for them to drift - and this is exactly where a stale
 *   price gets noticed, because the whole point of saving something is coming
 *   back to it weeks later.
 */
export default function Wishlist() {
  const { signedIn } = useSession();
  const [items, setItems] = useState([]);
  const [state, setState] = useState({ status: 'loading' });

  const load = async () => {
    const data = await authedFetch('/customer/wishlist');
    const list = data.wishlist?.products || data.wishlist?.items || data.products || [];
    setItems(list.filter(Boolean));
    setState({ status: 'idle' });
  };

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/customer/wishlist');
        if (cancelled) return;
        const list = data.wishlist?.products || data.wishlist?.items || data.products || [];
        setItems(list.filter(Boolean));
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <p className="text-muted-foreground">
        <Link href="/login?next=%2Fwishlist" className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to see what you have saved.
      </p>
    );
  }

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;
  if (state.status === 'error') return <p className="text-destructive">{state.message}</p>;

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        Nothing saved yet.{' '}
        <Link href="/shop" className="text-brand-ink underline">
          Have a look around
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((entry) => {
        const product = entry.productId || entry;

        return (
          <div key={product._id} className="space-y-2">
            <ProductCard product={product} />
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={async () => {
                try {
                  await authedFetch(`/customer/wishlist/${product._id}`, { method: 'DELETE' });
                  await load();
                } catch (err) {
                  setState({ status: 'error', message: err.message });
                }
              }}
            >
              Remove
            </Button>
          </div>
        );
      })}
    </div>
  );
}
