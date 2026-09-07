'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session';

/**
 * Same rule as the seller guard, and the same warning: this decides what to
 * DRAW, not what is allowed. Every /admin endpoint is behind
 * roleMiddleware('admin') on the server, which is the only thing standing
 * between a curious customer and somebody else's payout.
 */
export default function AdminGuard({ children }) {
  const { signedIn, role } = useSession();

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

  if (role !== 'admin') {
    return <p className="text-muted-foreground">This area is for the platform team.</p>;
  }

  return children;
}
