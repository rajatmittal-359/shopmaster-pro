'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addToCart } from '@/lib/analytics';
import { announceAdded } from '@/lib/cartEvents';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';

/**
 * Quantity, and the button the whole page exists for.
 *
 * WHY IT IS A CLIENT ISLAND AND NOTHING ELSE IS
 *   Price, stock, title and description are server-rendered so a crawler that
 *   runs no JavaScript still reads them. This is the only part that genuinely
 *   needs a browser, so it is the only part that ships any.
 *
 * WHY THERE IS A FIXED BAR ON MOBILE
 *   All three Indian D2C jewellery brands checked run one at 390px. The number
 *   usually quoted for it - "5-12% lift" - could not be traced to a real study
 *   and is recorded as unverified in the plan; the bar is here because the
 *   competitors have it and because the button otherwise scrolls out of reach
 *   on a page this long.
 *
 * THE SESSION IT READS
 *   useSession's drawing copy (19 Sep 2026): the real session is in httpOnly
 *   cookies that travel with authedFetch; this only decides which button to
 *   draw before the first request answers.
 */

export default function BuyBox({
  productId,
  name,
  price,
  inStock,
  maxQuantity,
  /** The path to come back to after signing in. Given by the server - see the
   *  sign-in link below for why it cannot be read from the browser. */
  returnTo = '/',
  /** { untilText, note } while the shop is on a break (utils/vacation) - buying waits. */
  shopBreak = null,
}) {
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState({ status: 'idle' });
  const [saved, setSaved] = useState(false);
  const { signedIn, capabilities } = useSession();
  const router = useRouter();
  // The admin account is not a shopper (backend/utils/capabilities: its orders
  // would sit in every report). Say so quietly instead of letting the buttons
  // fail with "Access denied" - Rajat saw exactly that on launch night.
  const adminOnly = Boolean(capabilities?.admin) && !capabilities?.customer;

  const add = async (thenCheckout = false) => {
    setState({ status: thenCheckout ? 'buying' : 'adding' });
    try {
      // authedFetch throws the server's own words - it knows things this button
      // does not, that the last one went while this page was open, for instance.
      await authedFetch('/customer/cart', { method: 'POST', body: { productId, quantity } });
      addToCart({ _id: productId, name, price }, quantity, price);
      // "Buy now" (Amazon, Flipkart, Meesho all have it beside Add to cart): the
      // same cart, straight to checkout - one screen less for the person who
      // has already decided.
      if (thenCheckout) return router.push('/checkout');
      setState({ status: 'added' });
      announceAdded({ productId, name, price, quantity, from: document.querySelector('[data-gallery-main] img') }); // photo flies to the bag, drawer opens, header count refreshes
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const cap = Math.max(1, Math.min(Number(maxQuantity) || 1, 10));

  const button = shopBreak ? (
    <Button disabled className="w-full" variant="ghost" size="sm">
      {shopBreak.untilText ? `Shop on a break - back ${shopBreak.untilText}` : 'Shop on a break'}
    </Button>
  ) : !inStock ? (
    <Button
      disabled
      className="w-full" variant="ghost" size="sm">
      Out of stock
    </Button>
  ) : adminOnly ? (
    <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      The admin account does not shop - its orders would sit in every report. Use a customer account to buy.
    </p>
  ) : !signedIn ? (
    <a
      /*
       * The path comes from the SERVER as a prop, not from window.location.
       * Reading the location here meant the server rendered
       * `?next=/` and the browser rendered `?next=/products/...` - a genuine
       * hydration mismatch, logged as an error on every product page, and React
       * does not patch attributes up. The page already knows its own path; it
       * just was not telling anybody.
       */
      href={`/login?next=${encodeURIComponent(returnTo)}`}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground"
    >
      Sign in to add to cart
    </a>
  ) : (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button
        onClick={() => add(false)}
        disabled={state.status === 'adding' || state.status === 'buying'}
        variant="outline"
        className="w-full" size="lg">
        {state.status === 'adding'
          ? 'Adding…'
          : state.status === 'added'
            ? 'Added to cart'
            : 'Add to cart'}
      </Button>
      <Button
        onClick={() => add(true)}
        disabled={state.status === 'adding' || state.status === 'buying'}
        className="w-full" size="lg">
        {state.status === 'buying' ? 'Opening checkout…' : 'Buy now'}
      </Button>
    </div>
  );

  return (
    <>
      <div className="space-y-3">
        {inStock && (
          <div className="flex items-center gap-3">
            <label htmlFor="qty" className="text-sm text-muted-foreground">
              Quantity
            </label>
            <select
              id="qty"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {Array.from({ length: cap }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}

        {button}

        {/*
          Saving is the honest alternative to a "buy now, decide later" nudge:
          the person who is not ready still leaves with the product findable.
          It needs a session for the same reason the cart does - the list lives
          on the account, not in this browser.
        */}
        {signedIn && !adminOnly && (
          <Button
            variant="outline"
            className="w-full"
            disabled={saved}
            onClick={async () => {
              try {
                await authedFetch('/customer/wishlist', { method: 'POST', body: { productId } });
                setSaved(true);
              } catch {
                setState({ status: 'error', message: 'Could not save that just now.' });
              }
            }}
          >
            {saved ? 'Saved' : 'Save for later'}
          </Button>
        )}

        <p aria-live="polite" className="min-h-5 text-sm">
          {state.status === 'error' && (
            <span className="text-destructive">{state.message}</span>
          )}
          {state.status === 'added' && (
            <span className="text-muted-foreground">
              In your cart. <a href="/cart" className="text-brand-ink underline">View cart</a>
            </span>
          )}
        </p>
      </div>

      {/* The fixed bar, on the shared `.glass` so it frosts the same way as the
          header and the menus rather than being its own one-off blur.
          Hidden once the page is wide enough for the button to
          stay in view on its own. */}
      <div className="glass fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t px-4 py-3 md:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">₹{price.toLocaleString('en-IN')}</p>
        </div>
        <div className="w-40">{button}</div>
      </div>
    </>
  );
}
