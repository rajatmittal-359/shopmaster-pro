'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Heart, ShoppingBag, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession, setCapabilities } from '@/lib/session';
import { authedFetch, signOut as endSession } from '@/lib/client';
import NotificationBell from '@/components/common/NotificationBell';
import { useCounts } from '@/lib/useCounts';
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
/**
 * @param {object} props
 * @param {boolean} [props.showCart]  false inside the seller/admin panels - a
 *   person running a shop is not shopping, and "Cart" in a dashboard's top bar
 *   is the storefront leaking in.
 */
const CountBadge = ({ n }) =>
  n > 0 ? (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-ink px-1 text-[0.6rem] font-semibold leading-none text-white">
      {n > 99 ? '99+' : n}
    </span>
  ) : null;

export default function HeaderAccount({ showCart = true }) {
  const counts = useCounts();
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

  const signOut = async () => {
    // The server ends this device's session and clears the cookies first.
    await endSession();
    router.push('/');
    router.refresh();
  };

  return (
    <div className="flex items-center gap-4 text-sm">
      {/* The heart and the bag carry their counts (Flipkart, Myntra): proof that
          "Add to cart" and "Save" went somewhere. Zero draws no badge. */}
      {showCart && signedIn && (
        <Link href="/wishlist" aria-label={counts.wishlist ? `Saved items (${counts.wishlist})` : 'Saved items'} className="relative inline-flex text-muted-foreground hover:text-brand-ink">
          <Heart className="size-5" />
          <CountBadge n={counts.wishlist} />
        </Link>
      )}
      {showCart && (
        <Link href="/cart" aria-label={counts.cart ? `Cart (${counts.cart})` : 'Cart'} className="relative inline-flex text-muted-foreground hover:text-brand-ink">
          <ShoppingBag className="size-5" />
          <CountBadge n={counts.cart} />
        </Link>
      )}

      {/* The bell sits where every panel and the storefront already share a header (plan 2.30). */}
      {signedIn && <NotificationBell />}

      {signedIn ? (
        <DropdownMenu>
          <DropdownMenuTrigger className="font-medium hover:text-brand-ink" aria-label={user?.name ? user.name.split(' ')[0] : 'Account'}>
            {/* The first name only: a header is not the place for a full name,
                and it is what the person calls themselves anyway. On the
                narrowest phones (15 Sep 2026: 12 px over at 390) an icon. */}
            <span className="hidden sm:inline">{user?.name ? user.name.split(' ')[0] : 'Account'}</span>
            <UserRound className="size-5 sm:hidden" aria-hidden />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{user?.email || 'Signed in'}</DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Flipkart's order: what you bought, what you saved, what you can
                use, what you said, where you live, who you are, and help. */}
            <DropdownMenuItem render={<Link href="/orders" />}>My orders</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/wishlist" />}>Saved items</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/coupons" />}>Coupons</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/reviews" />}>My reviews</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/addresses" />}>Addresses</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/account" />}>Account</DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/help" />}>Help</DropdownMenuItem>

            {/* Shown only to accounts that actually have the capability - and
                these are LINKS, not a mode switch: the same account keeps its
                cart and its orders while it is in the seller area. */}
            {(canSell || isAdmin) && <DropdownMenuSeparator />}
            {canSell && (
              <DropdownMenuItem render={<Link href="/seller" />}>Switch to selling</DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem render={<Link href="/admin" />}>Switch to admin</DropdownMenuItem>
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
