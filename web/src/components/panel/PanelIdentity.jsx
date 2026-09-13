'use client';

import { useEffect, useState } from 'react';
import { Store, ShieldCheck } from 'lucide-react';
import { useSession } from '@/lib/session';
import { authedFetch } from '@/lib/client';

/**
 * The block at the top of the sidebar that says whose panel this is.
 *
 * Shopify's admin opens its sidebar with the store's name; Seller Central
 * with the merchant token. It answers "am I in the right place" before the
 * first click - a person with two hats (Charming Jewels' owner is also the
 * admin) needs that more than anyone.
 */
export default function PanelIdentity({ kind }) {
  const { user } = useSession();
  const [shop, setShop] = useState(null);

  useEffect(() => {
    if (kind !== 'seller') return undefined;
    let cancelled = false;
    authedFetch('/seller/settings')
      .then((d) => {
        if (!cancelled) setShop(d.settings?.businessName || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const title = kind === 'admin' ? 'ShopMaster Pro' : shop || 'Your shop';
  const sub = kind === 'admin' ? 'Platform admin' : user?.name ? `Seller · ${user.name}` : 'Seller';
  const Icon = kind === 'admin' ? ShieldCheck : Store;

  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-brand-ink">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{sub}</span>
      </span>
    </div>
  );
}
