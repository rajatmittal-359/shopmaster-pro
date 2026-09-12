'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Core Web Vitals for the three pages that matter, on mobile, scored by
 * Google's own PageSpeed Insights. Search Console's "Page experience" report
 * shows the same verdicts a week late; this is today's, per page, with the
 * number behind each colour.
 */
const TONE = {
  good: 'text-emerald-700 dark:text-emerald-300',
  'needs-improvement': 'text-amber-700 dark:text-amber-300',
  poor: 'text-destructive',
};
const WORD = { good: 'good', 'needs-improvement': 'needs work', poor: 'poor' };

const ms = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const fmt = (metric, v) => (v == null ? '—' : metric === 'CLS' ? v.toFixed(2) : ms(v));

function Vital({ metric, label, data }) {
  if (!data) return null;
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${TONE[data.rating] || ''}`}>
        {fmt(metric, data.value)}
        {data.rating && <span className="ml-1 text-xs font-normal">{WORD[data.rating]}</span>}
      </div>
    </div>
  );
}

export default function Speed() {
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const ask = () =>
      authedFetch('/admin/google/speed')
        .then((d) => {
          if (cancelled) return;
          setState(d);
          if (d.building) timer = setTimeout(ask, 10000);
        })
        .catch((err) => {
          if (!cancelled) setState({ ok: false, reason: err.message, pages: [] });
        });
    ask();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!state) {
    return (
      <PanelCard title="Page speed">
        <div className="skeleton-in space-y-2" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </PanelCard>
    );
  }

  if (!state.ok) {
    return (
      <PanelCard title="Page speed" lead={state.reason}>
        <p className="text-sm text-muted-foreground">Needs a PageSpeed Insights API key on the server.</p>
      </PanelCard>
    );
  }

  return (
    <PanelCard
      title="Page speed · mobile"
      lead={state.building ? 'Google is measuring — 10 to 30 seconds a page.' : 'Google’s own scorer. Green is what ranks; the number is what to fix.'}
    >
      {state.pages.length === 0 && <p className="py-4 text-sm text-muted-foreground">Waiting for the first measurement…</p>}
      <ul className="divide-y">
        {state.pages.map((p) => (
          <li key={p.url} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
            <div className="min-w-0">
              <div className="font-medium">{p.label}</div>
              <div className="truncate text-xs text-muted-foreground">{p.url}</div>
              {!p.ok && <div className="text-xs text-destructive">{p.reason}</div>}
            </div>
            {p.ok && (
              <>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Score</div>
                  <div className={`text-sm font-medium tabular-nums ${p.score >= 90 ? TONE.good : p.score >= 50 ? TONE['needs-improvement'] : TONE.poor}`}>{p.score}</div>
                </div>
                <Vital metric="LCP" label="Largest paint" data={p.field.hasData ? p.field.LCP : p.lab.LCP} />
                <Vital metric="CLS" label="Layout shift" data={p.field.hasData ? p.field.CLS : p.lab.CLS} />
                {p.field.hasData ? <Vital metric="INP" label="Responsiveness" data={p.field.INP} /> : <Vital metric="TBT" label="Blocking time" data={p.lab.TBT} />}
              </>
            )}
          </li>
        ))}
      </ul>
      {state.pages.some((p) => p.ok && !p.field.hasData) && (
        <p className="mt-2 text-xs text-muted-foreground">Lab numbers (a simulated phone) until enough real visitors give Google field data.</p>
      )}
    </PanelCard>
  );
}
