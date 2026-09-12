'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * What Google searchers typed before they saw the shop - Search Console's
 * own numbers, read through the backend's service account.
 *
 * The first pull (12 Sep 2026, 90 days) said everything: seven queries, all
 * of them the brand name misspelt, not one product word, positions 10-47.
 * This card is here so that stays visible and measurable while the listing
 * work fixes it. Sorted by impressions: what Google is already willing to
 * show us for, that people are not yet clicking.
 */
const short = (page) => page.replace(/^https?:\/\/(www\.)?[^/]+/, '') || '/';

export default function SearchQueries({ base = '/admin', days = 28 }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authedFetch(`${base}/search/queries?days=${days}`)
      .then((d) => {
        if (!cancelled) setState(d);
      })
      .catch((err) => {
        if (!cancelled) setState({ ok: false, reason: err.message, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [base, days]);

  if (!state) {
    return (
      <PanelCard title="Google searches">
        <div className="skeleton-in space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </PanelCard>
    );
  }

  const rows = [...(state.rows || [])].sort((a, b) => b.impressions - a.impressions).slice(0, 12);
  const totals = (state.rows || []).reduce((t, r) => ({ imp: t.imp + r.impressions, clicks: t.clicks + r.clicks }), { imp: 0, clicks: 0 });

  return (
    <PanelCard
      title={`Google searches · last ${state.days || days} days`}
      lead={
        state.ok
          ? `${totals.imp} times shown, ${totals.clicks} clicks. Position is where the page sat in the results (1 is top).`
          : state.reason
      }
    >
      {state.ok && rows.length === 0 && (
        <p className="py-4 text-sm text-muted-foreground">Google has not shown the shop for any search in this window.</p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">People typed</th>
                <th className="py-1 pr-3 font-medium">Page shown</th>
                <th className="py-1 pr-3 text-right font-medium">Shown</th>
                <th className="py-1 pr-3 text-right font-medium">Clicks</th>
                <th className="py-1 text-right font-medium">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={`${r.query}|${r.page}`}>
                  <td className="py-1.5 pr-3 font-medium">{r.query}</td>
                  <td className="max-w-48 truncate py-1.5 pr-3 text-muted-foreground">{short(r.page)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.impressions}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{r.clicks}</td>
                  <td className={`py-1.5 text-right tabular-nums ${r.position > 10 ? 'text-muted-foreground' : 'text-emerald-700 dark:text-emerald-300'}`}>
                    {r.position}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}
