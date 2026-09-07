'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session';

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
  const { signedIn, role } = useSession();

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

  if (role !== 'seller') {
    return (
      <div className="rounded-xl border border-border p-6">
        <p className="font-medium">This account does not sell on ShopMaster Pro yet.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Selling is something you add to an account you already have - you do
          not need a second one. Write to us and we will set it up.
        </p>
        <Link href="/contact" className="mt-3 inline-block text-sm text-brand-ink hover:underline">
          Get in touch
        </Link>
      </div>
    );
  }

  return children;
}
