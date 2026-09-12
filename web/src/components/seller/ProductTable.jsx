'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, Search } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Everything this seller has listed, and the one number they change daily.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Shopify's Products: tabs by state (All / Active / Draft) with counts, a
 *   search box, one row per product with picture, title, status badge and
 *   "N in stock", and the row itself opens the editor. Seller Central's
 *   Manage Inventory adds the thing Shopify makes you open a page for:
 *   editing the quantity in the row. Ours keeps that - stock is the field a
 *   shop touches every day, so it stays inline.
 *
 * WHY "SELLABLE" IS SHOWN NEXT TO STOCK
 *   Units held in open checkouts are not sellable yet and not sold yet. A
 *   seller who sees 5 in stock and 5 held should not be surprised by "out of
 *   stock" on their own product page.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const sellable = (p) => Math.max(0, (p.stock || 0) - (p.reserved || 0));

const TABS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'live', label: 'Live', test: (p) => p.isActive && sellable(p) > 0 },
  { id: 'out', label: 'Out of stock', test: (p) => p.isActive && sellable(p) === 0 },
  { id: 'hidden', label: 'Hidden', test: (p) => !p.isActive },
];

const EMPTY = {
  all: 'Nothing listed yet.',
  live: 'Nothing is live right now.',
  out: 'Nothing is out of stock.',
  hidden: 'Nothing is hidden from the shop.',
};

function StatusBadge({ product }) {
  if (!product.isActive) return <Badge variant="outline">Hidden</Badge>;
  const left = sellable(product);
  if (left === 0) return <Badge variant="destructive">Out of stock</Badge>;
  if (left <= (product.lowStockThreshold || 10)) {
    return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">Low · {left} left</Badge>;
  }
  return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Live</Badge>;
}

export default function ProductTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'all';

  const [products, setProducts] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [q, setQ] = useState('');

  const load = () =>
    authedFetch('/seller/products').then((data) => {
      setProducts(data.products || []);
      setState({ status: 'idle' });
    });

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/products')
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products || []);
        setState({ status: 'idle' });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('tab');
    else next.set('tab', id);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, products.filter(t.test).length])), [products]);

  const shown = useMemo(() => {
    const test = TABS.find((t) => t.id === tab).test;
    const needle = q.trim().toLowerCase();
    return products.filter(test).filter((p) => !needle || [p.name, p.sku, p.size].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [products, tab, q]);

  const saveStock = async (product) => {
    const value = edits[product._id];
    if (value === undefined || value === '') return;
    setSaving(product._id);
    try {
      await authedFetch(`/seller/products/${product._id}/stock`, {
        method: 'PATCH',
        body: { stock: Number(value), reason: 'Counted by the seller' },
      });
      setEdits((current) => ({ ...current, [product._id]: undefined }));
      await load();
      toast.success(`${product.name}: stock is now ${Number(value)}`, {
        description: 'Written to the stock history.',
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(null);
    }
  };

  if (state.status === 'loading') return <TableSkeleton />;
  if (state.status === 'error') {
    return (
      <PanelCard>
        <p className="text-sm text-destructive">{state.message}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => load().catch((e) => toast.error(e.message))}>
          Try again
        </Button>
      </PanelCard>
    );
  }

  if (products.length === 0) {
    return (
      <PanelCard>
        <div className="py-8 text-center">
          <p className="font-medium">Nothing listed yet</p>
          <p className="mt-1 text-sm text-muted-foreground">One photo is enough to start - the AI can write the listing.</p>
          <Button className="mt-4" nativeButton={false} render={<Link href="/seller/products/new" />}>
            List your first product
          </Button>
        </div>
      </PanelCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Product state" className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition ${
                  active ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                <span className={`tabular-nums ${active ? 'text-brand-ink' : ''}`}>{counts[t.id]}</span>
              </button>
            );
          })}
        </div>
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-3 sm:w-64">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, SKU or size"
            aria-label="Search your products"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <PanelCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            {q.trim() ? `Nothing here matches “${q.trim()}”.` : EMPTY[tab]}
          </p>
        </PanelCard>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {shown.map((product) => {
            const edited = edits[product._id];
            const dirty = edited !== undefined && String(edited) !== String(product.stock);
            return (
              <li key={product._id} className="flex flex-wrap items-center gap-3 p-3 sm:gap-4">
                <Link href={`/seller/products/${product._id}`} className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {product.images?.[0] && <Image src={product.images[0]} alt="" fill sizes="56px" className="object-cover" />}
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* The row opens the editor, as Shopify's does. */}
                    <Link href={`/seller/products/${product._id}`} className="font-medium hover:text-brand-ink">
                      {product.name}
                    </Link>
                    <StatusBadge product={product} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    <span className="tabular-nums">{money(product.price)}</span>
                    {product.size ? ` · size ${product.size}` : ''}
                    {product.sku ? ` · ${product.sku}` : ''}
                    {product.reserved > 0 ? ` · ${product.reserved} held in checkouts` : ''}
                  </p>
                  <p className="mt-0.5 text-xs">
                    <Link href={`/products/${product.slug || product._id}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand-ink">
                      View in shop <ExternalLink className="size-3" />
                    </Link>
                    <span className="text-muted-foreground"> · </span>
                    {/* Clothing and shoes need a row per size - Google requires
                        `size` and disapproves without it. This copies the style
                        so only the size and the count are typed. */}
                    <Link href={`/seller/products/new?from=${product._id}`} className="text-brand-ink hover:underline">
                      Add a size
                    </Link>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`stock-${product._id}`}>
                    Stock for {product.name}
                  </label>
                  <Input
                    id={`stock-${product._id}`}
                    inputMode="numeric"
                    value={edited ?? product.stock ?? 0}
                    onChange={(e) => setEdits({ ...edits, [product._id]: e.target.value.replace(/\D/g, '') })}
                    onKeyDown={(e) => e.key === 'Enter' && dirty && saveStock(product)}
                    className="w-20 text-right tabular-nums"
                  />
                  <Button onClick={() => saveStock(product)} disabled={!dirty || saving === product._id} variant="outline" size="sm">
                    {saving === product._id ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="skeleton-in space-y-4" aria-busy="true" aria-label="Loading products">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-80 rounded-lg" />
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="size-14 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
