'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSession, setCapabilities } from '@/lib/session';
import { authedFetch } from '@/lib/client';

/**
 * Nothing in here is a security boundary, and it must not be mistaken for one.
 *
 * The server decides what a seller may do - every /seller route is behind
 * authMiddleware, roleMiddleware('seller') and checkSellerStatus. This only
 * decides what to DRAW, so a customer who types /seller sees an explanation
 * instead of a screen full of failed requests.
 *
 * Which is also why the role is read from the session rather than trusted from
 * anywhere else: if it were wrong, the API would still refuse.
 */
export default function SellerGuard({ children }) {
  const { signedIn, canSell, capabilities } = useSession();

  /*
   * Ask what this account can do, in case the page was opened directly rather
   * than reached through the header. Cheap, and it is the same answer the API
   * will enforce a moment later.
   */
  useEffect(() => {
    if (!signedIn || capabilities) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const me = await authedFetch('/auth/me');
        if (!cancelled) setCapabilities(me.capabilities);
      } catch {
        // Leave it undrawn rather than guess.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, capabilities]);

  if (!signedIn) {
    return (
      <p className="text-muted-foreground">
        <Link href="/login?next=%2Fseller" className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to open your seller dashboard.
      </p>
    );
  }

  if (!canSell) {
    return (
      <div className="rounded-xl border border-border p-6">
        <p className="font-medium">This account does not sell on ShopMaster Pro yet.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Selling is something you add to the account you already have - you do
          not need a second one, and you keep your cart and your orders.
        </p>
        <Link href="/sell" className="mt-3 inline-block text-sm text-brand-ink hover:underline">
          Apply to sell
        </Link>
      </div>
    );
  }

  return children;
}
