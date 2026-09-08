'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, clearSession, setCapabilities } from '@/lib/session';
import { authedFetch } from '@/lib/client';

/**
 * The right-hand side of the header, and the only part of it that differs
 * between two people looking at the same page. Everything else - the mark,
 * Shop, Contact, the category strip - stays server-rendered, so a signed-out
 * visitor and a crawler download no JavaScript for it.
 *
 * WHY IT ASKS /auth/me ON EVERY LOAD
 *   One account can now buy AND sell, so what to show is no longer a property
 *   of the token - it is what the database says the account can do. An admin
 *   can suspend a shop at any moment; drawing seller navigation from a token
 *   minted before that would offer buttons the API has already begun refusing.
 *   The answer is cached in the session so this is one request per page load,
 *   not one per link.
 *
 * WHAT A SIGNED-OUT VISITOR SEES
 *   The cart, and "Sign in". The cart link is shown to everyone on purpose:
 *   asking somebody to sign in before they can even see what a cart IS is the
 *   behaviour this rebuild is removing.
 */
export default function HeaderAccount() {
  const router = useRouter();
  const { signedIn, user, canSell, isAdmin } = useSession();

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const me = await authedFetch('/auth/me');
        if (!cancelled) setCapabilities(me.capabilities);
      } catch {
        // A failure here must not break the header. The links simply stay as
        // they were, and every one of them is checked by the API anyway.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

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
          {/* Shown only to accounts that actually have the capability - and it
              is a LINK, not a mode switch: the same account keeps its cart and
              its orders while it is in the seller area. */}
          {canSell && (
            <Link href="/seller" className="text-muted-foreground hover:text-brand-ink">
              Sell
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" className="text-muted-foreground hover:text-brand-ink">
              Admin
            </Link>
          )}

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
