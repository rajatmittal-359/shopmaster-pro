'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, clearSession } from '@/lib/session';

/**
 * The right-hand side of the header.
 *
 * WHY THIS SMALL PIECE IS THE ONLY CLIENT PART OF THE HEADER
 *   It is the only part that differs between two people looking at the same
 *   page. Everything else - the mark, Shop, Contact - is identical for
 *   everybody and stays server-rendered, so a signed-out visitor and a crawler
 *   download no JavaScript for it.
 *
 * WHAT A SIGNED-OUT VISITOR SEES
 *   The cart, and "Sign in". The cart link is deliberately shown to everyone:
 *   asking somebody to sign in before they can even see what a cart IS is the
 *   behaviour this rebuild is removing.
 */
export default function HeaderAccount() {
  const router = useRouter();
  const { signedIn, user } = useSession();

  const signOut = () => {
    clearSession();
    router.push('/');
    router.refresh();
  };

  return (
    <div className="flex items-center gap-4 text-sm">
      <Link href="/cart" className="text-muted-foreground hover:text-brand-ink">
        Cart
      </Link>

      {signedIn ? (
        <>
          <Link href="/wishlist" className="text-muted-foreground hover:text-brand-ink">
            Saved
          </Link>
          <Link href="/orders" className="text-muted-foreground hover:text-brand-ink">
            {/* The first name only: a header is not the place for a full name,
                and it is what the person calls themselves anyway. */}
            {user?.name ? user.name.split(' ')[0] : 'Account'}
          </Link>
          <button onClick={signOut} className="text-muted-foreground hover:text-brand-ink">
            Sign out
          </button>
        </>
      ) : (
        <Link href="/login" className="font-medium hover:text-brand-ink">
          Sign in
        </Link>
      )}
    </div>
  );
}
