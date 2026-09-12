'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import PanelCard from '@/components/panel/PanelCard';

/**
 * The catalogue against Google, for the admin.
 *
 * Search Console's "Pages" report and Merchant Center's "Needs attention"
 * list, joined on our product id, so one screen answers: which product pages
 * has Google indexed, which items has Shopping approved, and what exactly it
 * objected to. Problems first, the way both Google reports sort.
 *
 * Until the October cutover the storefront URLs this checks are not yet what
 * the domain serves, so "unknown to Google" is the expected answer and is
 * labelled as such - the numbers start meaning something the day the sitemap
 * is submitted from the new app.
 */
const FILTERS = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'all', label: 'All products' },
];

const needsAttention = (r) => r.merchant.status === 'disapproved' || r.index.indexed === false || r.merchant.status === 'not in feed';

const indexLabel = (index) => {
  if (index.indexed === true) return { text: 'Indexed', tone: 'text-emerald-700 dark:text-emerald-300' };
  if (index.indexed === false) return { text: index.state || 'Not indexed', tone: 'text-amber-700 dark:text-amber-300' };
  return { text: index.reason ? `Unknown · ${index.reason}` : 'Unknown', tone: 'text-muted-foreground' };
};

const merchantLabel = (m) => {
  if (m.status === 'approved') return { text: 'Approved', tone: 'text-emerald-700 dark:text-emerald-300' };
  if (m.status === 'disapproved') return { text: 'Disapproved', tone: 'text-destructive' };
  if (m.status === 'pending') return { text: 'Under review', tone: 'text-amber-700 dark:text-amber-300' };
  if (m.status === 'not in feed') return { text: 'Not in the feed', tone: 'text-muted-foreground' };
  return { text: m.reason ? `Unknown · ${m.reason}` : 'Unknown', tone: 'text-muted-foreground' };
};

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');

export default function GoogleStatus() {
  const [state, setState] = useState(null);
  const [filter, setFilter] = useState('attention');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const ask = (refresh) =>
      authedFetch(`/admin/google/products${refresh ? '?refresh=1' : ''}`)
        .then((d) => {
          if (cancelled) return;
          setState(d);
          // Fifty inspections take about a minute; ask again until it is there.
          if (d.building) timer = setTimeout(() => ask(false), 8000);
        })
        .catch((err) => {
          if (!cancelled) setState({ ok: false, reason: err.message, rows: [], summary: null });
        });
    ask(tick > 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tick]);

  if (!state) {
    return (
      <PanelCard title="Google's verdict on every product">
        <div className="skeleton-in space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </PanelCard>
    );
  }

  const s = state.summary;
  const rows = (state.rows || []).filter((r) => filter === 'all' || needsAttention(r));
  const preCutover = s && s.total > 0 && s.indexed === 0 && (state.rows || []).every((r) => /unknown to Google/i.test(r.index.state || ''));

  return (
    <div className="space-y-6">
      {state.building && (
        <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground" aria-live="polite">
          Asking Google about each product page — about a minute the first time. {state.rows?.length ? 'Showing the last answer meanwhile.' : ''}
        </p>
      )}

      {s && (
        <div className="grid gap-4 sm:grid-cols-3">
          <PanelCard title="In Google's index" className="min-w-0">
            <p className="text-3xl font-semibold tabular-nums">
              {s.indexed}
              <span className="text-base font-normal text-muted-foreground"> of {s.total}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {preCutover
                ? 'Expected before the cutover: these addresses are not live yet. Submit the sitemap on cutover day and this fills in.'
                : `${s.notIndexed} not indexed${s.indexUnknown ? `, ${s.indexUnknown} unknown` : ''}`}
            </p>
          </PanelCard>
          <PanelCard title="Approved for Shopping" className="min-w-0">
            <p className="text-3xl font-semibold tabular-nums">
              {s.approved}
              <span className="text-base font-normal text-muted-foreground"> of {s.total}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {s.disapproved ? `${s.disapproved} disapproved · ` : ''}
              {s.pending ? `${s.pending} under review · ` : ''}
              {s.notInFeed ? `${s.notInFeed} not in the feed` : 'every product is in the feed'}
            </p>
          </PanelCard>
          <PanelCard title="Checked" className="min-w-0">
            <p className="text-3xl font-semibold tabular-nums">{when(state.at)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Remembered six hours.</p>
            <Button variant="outline" size="sm" className="mt-3" disabled={Boolean(state.building)} onClick={() => setTick((t) => t + 1)}>
              Ask Google again
            </Button>
          </PanelCard>
        </div>
      )}

      {state.merchantReason && (
        <p className="text-sm text-muted-foreground">Merchant Center did not answer: {state.merchantReason}</p>
      )}

      <PanelCard
        title="Product by product"
        lead="Sorted the way Google sorts: disapproved first, then not indexed, then missing from the feed."
        aside={
          <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${filter === f.key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {state.rows?.length ? 'Nothing needs attention.' : state.building ? 'Waiting for Google…' : 'No products to check.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Product</th>
                  <th className="py-1 pr-3 font-medium">Google index</th>
                  <th className="py-1 pr-3 font-medium">Shopping</th>
                  <th className="py-1 text-right font-medium">Last crawl</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const idx = indexLabel(r.index);
                  const mer = merchantLabel(r.merchant);
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="py-2 pr-3">
                        <Link href={`/products/${r.slug || r.id}`} className="font-medium hover:underline" target="_blank" rel="noreferrer">
                          {r.name}
                        </Link>
                        {r.sellerName && <div className="text-xs text-muted-foreground">{r.sellerName}</div>}
                      </td>
                      <td className={`py-2 pr-3 ${idx.tone}`}>{idx.text}</td>
                      <td className={`py-2 pr-3 ${mer.tone}`}>
                        {mer.text}
                        {r.merchant.issues?.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {r.merchant.issues.slice(0, 3).map((i) => (
                              <li key={i.code}>
                                {i.text}
                                {i.help && (
                                  <>
                                    {' '}
                                    <a href={i.help} target="_blank" rel="noreferrer" className="underline">
                                      how to fix
                                    </a>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{when(r.index.lastCrawl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
}
