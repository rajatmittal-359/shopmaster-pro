'use client';

import { useState, useSyncExternalStore } from 'react';
import { apiBase } from '@/lib/api';

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
 *   `smp_token`, the same key the React app writes. The two apps share a domain
 *   after the cutover, so one signed-in session serves both and nobody is
 *   logged out by the migration.
 */
/**
 * Reading the session without an effect.
 *
 * Setting state inside useEffect to "notice" localStorage renders the button
 * once and then corrects it, which React's own lint rule now flags. This
 * subscribes instead: the server snapshot is "signed out" (a server has no
 * localStorage), the client's real answer replaces it on hydration, and the
 * `storage` event means signing in on another tab updates this one.
 */
const subscribeToSession = (onChange) => {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
};

const readToken = () => {
  try {
    return localStorage.getItem('smp_token');
  } catch {
    // Private mode, or site data blocked. Signed out is the safe reading.
    return null;
  }
};

export default function BuyBox({ productId, name, price, inStock, maxQuantity }) {
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState({ status: 'idle' });
  const token = useSyncExternalStore(subscribeToSession, readToken, () => null);
  const signedIn = Boolean(token);

  const add = async () => {
    setState({ status: 'adding' });
    try {
      const res = await fetch(`${apiBase}/customer/cart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId, quantity }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // The server's own words. It knows things this button does not - that
        // the last one went while this page was open, for instance.
        throw new Error(body.message || 'Could not add that to your cart');
      }

      setState({ status: 'added' });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const cap = Math.max(1, Math.min(Number(maxQuantity) || 1, 10));

  const button = !inStock ? (
    <button
      disabled
      className="h-12 w-full rounded-lg bg-muted font-medium text-muted-foreground"
    >
      Out of stock
    </button>
  ) : !signedIn ? (
    <a
      href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? '/' : window.location.pathname)}`}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground"
    >
      Sign in to add to cart
    </a>
  ) : (
    <button
      onClick={add}
      disabled={state.status === 'adding'}
      className="h-12 w-full rounded-lg bg-primary font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
    >
      {state.status === 'adding'
        ? 'Adding…'
        : state.status === 'added'
          ? 'Added to cart'
          : 'Add to cart'}
    </button>
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

      {/* The fixed bar. Hidden once the page is wide enough for the button to
          stay in view on its own. */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">₹{price.toLocaleString('en-IN')}</p>
        </div>
        <div className="w-40">{button}</div>
      </div>
    </>
  );
}
