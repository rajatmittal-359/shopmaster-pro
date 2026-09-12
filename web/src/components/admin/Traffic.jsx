'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Who came and where they stopped - GA4, read through the backend.
 *
 * Shopify's Analytics home leads with sessions and a conversion funnel; this
 * is that, at our size: three numbers and four steps. The funnel is the one
 * that matters - the step with the biggest drop is the next piece of work.
 */
const STEPS = [
  ['view_item', 'Viewed a product'],
  ['add_to_cart', 'Added to cart'],
  ['begin_checkout', 'Started checkout'],
  ['purchase', 'Paid'],
];

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

export default function Traffic({ days = 28 }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authedFetch(`/admin/google/traffic?days=${days}`)
      .then((d) => {
        if (!cancelled) setState(d);
      })
      .catch((err) => {
        if (!cancelled) setState({ ok: false, reason: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!state) {
    return (
      <PanelCard title="Visitors">
        <div className="skeleton-in space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </PanelCard>
    );
  }

  if (!state.ok) {
    return (
      <PanelCard title="Visitors" lead={state.reason}>
        <p className="text-sm text-muted-foreground">
          Needs a GA4 property: its Measurement ID on the storefront and its Property ID plus the service account as Viewer on the API.
        </p>
      </PanelCard>
    );
  }

  const f = state.funnel;
  return (
    <PanelCard title={`Visitors · last ${state.days} days`} lead={`${state.sessions} visits by ${state.users} people, ${state.pageViews} pages read.`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">From product to payment</h3>
          <ol className="mt-2 space-y-1.5 text-sm">
            {STEPS.map(([key, label], i) => {
              const prev = i === 0 ? null : f[STEPS[i - 1][0]];
              return (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span>{label}</span>
                  <span className="tabular-nums">
                    {f[key]}
                    {prev != null && <span className="ml-2 text-xs text-muted-foreground">{pct(f[key], prev)} of previous</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Most read</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {state.topPages.slice(0, 6).map((p) => (
              <li key={p.path} className="flex justify-between gap-3">
                <span className="truncate text-muted-foreground">{p.path}</span>
                <span className="tabular-nums">{p.views}</span>
              </li>
            ))}
            {state.topPages.length === 0 && <li className="text-muted-foreground">Nothing yet.</li>}
          </ul>
        </div>
      </div>
    </PanelCard>
  );
}
