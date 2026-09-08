'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, clearSession, setCapabilities } from '@/lib/session';
import { authedFetch } from '@/lib/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The right-hand side of the header.
 *
 * WHY THE ACCOUNT LINKS ARE A MENU AND THE CART IS NOT
 *   Amazon and Flipkart both do exactly this: the cart stays a permanent
 *   target because it is the one thing a shopper reaches for mid-task, and
 *   everything about the account - orders, saved items, selling, signing out -
 *   folds into one menu behind the person's name. Six flat links across a
 *   header is how a phone runs out of room and how the cart stops being
 *   obvious.
 *
 * WHY IT ASKS /auth/me ON EVERY LOAD
 *   One account can now buy AND sell, so what to show is not a property of the
 *   token - it is what the database says the account can do. An admin can
 *   suspend a shop at any moment; drawing seller navigation from a token minted
 *   before that would offer buttons the API has already begun refusing.
 *
 * WHAT A SIGNED-OUT VISITOR SEES
 *   The cart, and "Sign in". The cart is shown to everyone on purpose: asking
 *   somebody to sign in before they can see what a cart IS is the behaviour
 *   this rebuild is removing.
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
        // A failure here must not break the header. The links stay as they
        // were, and every one of them is checked by the API anyway.
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
        <DropdownMenu>
          <DropdownMenuTrigger className="font-medium hover:text-brand-ink">
            {/* The first name only: a header is not the place for a full name,
                and it is what the person calls themselves anyway. */}
            {user?.name ? user.name.split(' ')[0] : 'Account'}
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{user?.email || 'Signed in'}</DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem render={<Link href="/orders" />}>My orders</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/wishlist" />}>Saved items</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/addresses" />}>Addresses</DropdownMenuItem>

            {/* Shown only to accounts that actually have the capability - and
                these are LINKS, not a mode switch: the same account keeps its
                cart and its orders while it is in the seller area. */}
            {(canSell || isAdmin) && <DropdownMenuSeparator />}
            {canSell && (
              <DropdownMenuItem render={<Link href="/seller" />}>Seller dashboard</DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem render={<Link href="/admin" />}>Admin</DropdownMenuItem>
            )}
            {!canSell && !isAdmin && (
              <DropdownMenuItem render={<Link href="/sell" />}>
                Sell on ShopMaster Pro
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Link href="/login" className="font-medium hover:text-brand-ink">
          Sign in
        </Link>
      )}
    </div>
  );
}
