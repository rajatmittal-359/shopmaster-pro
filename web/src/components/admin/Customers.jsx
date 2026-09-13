'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';
import ActionDialog from '@/components/common/ActionDialog';

/**
 * Customers - who buys here, and the few who cost money.
 *
 * Every marketplace admin (CS-Cart, Dokan, Mirakl, Shopify's Customers) has
 * this list; ours did not, so a customer who cancelled every COD order or
 * disputed every parcel was invisible until a seller complained. The flag
 * is a plain rule stated on the row, not a score nobody can argue with:
 * three cancels, two disputes, or more cancels than kept orders.
 *
 * Block is the only action, and it is reversible: the account cannot sign
 * in or order; nothing is deleted, the history stays.
 */
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'flagged', label: 'Flagged', test: (c) => c.flag },
  { key: 'blocked', label: 'Blocked', test: (c) => c.blocked },
];

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function Customers() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authedFetch('/admin/customers')
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
    return data.customers.filter((c) => !f.test || f.test(c)).filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle));
  }, [data, filter, q]);

  const setBlocked = async (c, blocked, reason) => {
    setBusy(true);
    try {
      await authedFetch(`/admin/customers/${c._id}/block`, { method: 'PATCH', body: { blocked, reason } });
      setData((d) => ({ ...d, customers: d.customers.map((x) => (x._id === c._id ? { ...x, blocked } : x)) }));
      toast(blocked ? `${c.name} blocked` : `${c.name} unblocked`, blocked ? { action: { label: 'Undo', onClick: () => setBlocked(c, false) } } : undefined);
      setAsking(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="skeleton-in space-y-3" aria-busy="true">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const counts = { all: data.summary.total, flagged: data.summary.flagged, blocked: data.summary.blocked };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${filter === f.key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f.label}
              <span className="text-xs tabular-nums opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="h-9 max-w-xs" aria-label="Search customers" />
      </div>

      <PanelCard title={`${rows.length} customer${rows.length === 1 ? '' : 's'}`} lead="Flagged = 3+ cancels, 2+ disputes, or more cancelled than kept. A flag is a reason to look, not a verdict.">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nobody here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Customer</th>
                  <th className="py-1 pr-3 text-right font-medium">Orders</th>
                  <th className="py-1 pr-3 text-right font-medium">Spent</th>
                  <th className="py-1 pr-3 text-right font-medium">Cancelled</th>
                  <th className="py-1 pr-3 text-right font-medium">Disputes</th>
                  <th className="py-1 pr-3 font-medium">Last order</th>
                  <th className="py-1 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((c) => (
                  <tr key={c._id} className={c.blocked ? 'opacity-60' : ''}>
                    <td className="py-2 pr-3">
                      <span className="block font-medium">
                        {c.name}
                        {c.flag && !c.blocked && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">FLAG</span>}
                        {c.blocked && <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-destructive">BLOCKED</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.email} · joined {when(c.joinedAt)}
                        {!c.verified ? ' · email not verified' : ''}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{c.orders}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(c.spend)}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${c.cancelled >= 3 ? 'text-destructive' : ''}`}>{c.cancelled}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${c.disputes >= 2 ? 'text-destructive' : ''}`}>{c.disputes}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{when(c.lastOrderAt)}</td>
                    <td className="py-2 text-right">
                      {c.blocked ? (
                        <Button size="sm" variant="ghost" onClick={() => setBlocked(c, false)} disabled={busy}>
                          Unblock
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setAsking(c)}>
                          Block
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>

      <ActionDialog
        open={Boolean(asking)}
        onOpenChange={(next) => setAsking(next ? asking : null)}
        title={`Block ${asking?.name || 'this customer'}`}
        description="They cannot sign in or place orders. Nothing is deleted - their orders and reviews stay - and you can unblock later."
        reasons={['Repeated COD refusals', 'Disputes on delivered orders', 'Abusive to a seller', 'Payment fraud']}
        requireReason
        confirmLabel="Block"
        destructive
        busy={busy}
        onConfirm={(reason) => asking && setBlocked(asking, true, reason)}
      />
    </div>
  );
}
