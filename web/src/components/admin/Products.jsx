'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { authedFetch } from '@/lib/client';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Every seller's catalogue in one list - the marketplace's own QA desk.
 *
 * CS-Cart, Dokan and Mirakl all give the operator a Products page across
 * vendors; ours had none, so the admin could not see a weak listing until a
 * customer did. The listing score here is the same number the seller sees at
 * the top of their product form (utils/listingScore, both ends), so "fix
 * your score" is a conversation about one number.
 */
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'weak', label: 'Weak listings', test: (p) => p.score < 60 },
  { key: 'out', label: 'Out of stock', test: (p) => p.stock === 0 },
  { key: 'hidden', label: 'Hidden', test: (p) => !p.isActive },
];

const scoreTone = (s) => (s >= 80 ? 'text-emerald-700 dark:text-emerald-300' : s >= 60 ? 'text-amber-700 dark:text-amber-300' : 'text-destructive');

export default function Products() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    authedFetch('/admin/products')
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const f = FILTERS.find((x) => x.key === filter);
    const needle = q.trim().toLowerCase();
    return data.products
      .filter((p) => !f.test || f.test(p))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.shop || '').toLowerCase().includes(needle))
      .sort((a, b) => (filter === 'weak' ? a.score - b.score : 0));
  }, [data, filter, q]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="skeleton-in space-y-3" aria-busy="true">
        <Skeleton className="h-9 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const s = data.summary;
  const counts = { all: s.total, weak: s.weak, out: s.outOfStock, hidden: s.hidden };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${filter === f.key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f.label}
              <span className="text-xs tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or shop" className="h-9 max-w-xs" aria-label="Search products" />
      </div>

      <PanelCard title={`${rows.length} product${rows.length === 1 ? '' : 's'}`} lead={filter === 'weak' ? 'Score under 60 - the three fixes are on each product’s own form. Worst first.' : undefined}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Product</th>
                  <th className="py-1 pr-3 font-medium">Shop</th>
                  <th className="py-1 pr-3 text-right font-medium">Price</th>
                  <th className="py-1 pr-3 text-right font-medium">Stock</th>
                  <th className="py-1 pr-3 text-right font-medium">Score</th>
                  <th className="py-1 text-right font-medium">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((p) => (
                  <tr key={p._id} className={p.isActive ? '' : 'opacity-60'}>
                    <td className="py-2 pr-3">
                      <Link href={`/products/${p.slug || p._id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                        <span className="relative size-9 shrink-0 overflow-hidden rounded border bg-muted">
                          {p.image && <Image src={p.image} alt="" fill unoptimized className="object-cover" sizes="36px" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {p.category || '—'}
                            {!p.isActive ? ' · hidden' : ''}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.shop || '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">₹{Number(p.price).toLocaleString('en-IN')}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${p.stock === 0 ? 'text-destructive' : ''}`}>{p.stock}</td>
                    <td className={`py-2 pr-3 text-right font-medium tabular-nums ${scoreTone(p.score)}`}>{p.score}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{p.totalReviews ? `${p.avgRating} ★ (${p.totalReviews})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
