'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { addToCart } from '@/lib/analytics';
import { announceAdded } from '@/lib/cartEvents';

/**
 * The round "+" on a product card (E2, 22 Sep 2026): one tap puts one into
 * the bag without opening the page. Meesho and Zara keep it on the tile;
 * Myntra shows it on hover. Ours: always there on a phone (no hover), fades
 * in on hover or keyboard focus on a wide screen, so the grid stays calm.
 *
 * Each size is its own product row, so there is nothing to choose here - the
 * card IS the variant. Out of stock or an admin account: no button at all.
 * Signed out: the tap goes to sign-in and comes back to the product.
 */
export default function QuickAdd({ productId, name, price, href, className = '' }) {
  const router = useRouter();
  const { signedIn, capabilities } = useSession();
  const [state, setState] = useState('idle'); // idle | adding | added
  const adminOnly = Boolean(capabilities?.admin) && !capabilities?.customer;
  if (adminOnly) return null;

  const add = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const from = e.currentTarget.closest('.group')?.querySelector('img') || null;
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(href)}`);
    if (state !== 'idle') return undefined;
    setState('adding');
    try {
      await authedFetch('/customer/cart', { method: 'POST', body: { productId, quantity: 1 } });
      addToCart({ _id: productId, name, price }, 1, price);
      announceAdded({ productId, name, price, quantity: 1, from });
      setState('added');
      setTimeout(() => setState('idle'), 1800);
    } catch (err) {
      setState('idle');
      const { toast } = await import('sonner');
      toast.error(err.message || 'Could not add that just now');
    }
    return undefined;
  };

  return (
    <button
      type="button"
      onClick={add}
      aria-label={state === 'added' ? `${name} is in your cart` : `Add ${name} to cart`}
      disabled={state === 'adding'}
      className={`grid size-9 place-items-center rounded-full bg-background/95 text-foreground shadow-md ring-1 ring-border transition hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70 md:opacity-0 md:group-hover:opacity-100 ${state === 'added' ? 'bg-primary text-primary-foreground md:opacity-100' : ''} ${className}`}
    >
      {state === 'added' ? <Check className="size-4" aria-hidden /> : <Plus className={`size-4 ${state === 'adding' ? 'animate-spin' : ''}`} aria-hidden />}
    </button>
  );
}
