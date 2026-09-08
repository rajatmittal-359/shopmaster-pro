'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSession, setCapabilities } from '@/lib/session';
import { authedFetch } from '@/lib/client';

/**
 * Same rule as the seller guard, and the same warning: this decides what to
 * DRAW, not what is allowed. Every /admin endpoint is behind
 * roleMiddleware('admin') on the server, which is the only thing standing
 * between a curious customer and somebody else's payout.
 */
export default function AdminGuard({ children }) {
  const { signedIn, isAdmin, capabilities } = useSession();

  useEffect(() => {
    if (!signedIn || capabilities) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const me = await authedFetch('/auth/me');
        if (!cancelled) setCapabilities(me.capabilities);
      } catch {
        // The API refuses anyway; this only decides what to draw.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, capabilities]);

  if (!signedIn) {
    return (
      <p className="text-muted-foreground">
        <Link href="/login?next=%2Fadmin" className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to open the admin area.
      </p>
    );
  }

  if (!isAdmin) {
    return <p className="text-muted-foreground">This area is for the platform team.</p>;
  }

  return children;
}
