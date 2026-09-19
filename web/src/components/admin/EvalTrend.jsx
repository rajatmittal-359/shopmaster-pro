'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import PanelCard from '@/components/panel/PanelCard';

/**
 * The assistant's weekly exam, as a trend (plan 2.23).
 *
 * Eleven fixed questions across the three roles and three languages, graded
 * by code every Sunday night (utils/ai/evals): right script, no filler,
 * short, a next step when due, the numbers that must appear. Twelve bars,
 * newest on the right; the height is the clean share. Below, what failed in
 * the latest run in words - the thing to read after a prompt change or a
 * new road, before anyone else notices.
 */
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function EvalTrend() {
  const [runs, setRuns] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authedFetch('/admin/assist/evals')
      .then((d) => !cancelled && setRuns((d.runs || []).slice().reverse()))
      .catch(() => !cancelled && setRuns([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = runs && runs.length ? runs[runs.length - 1] : null;
  const share = (r) => (r.cases ? r.clean / r.cases : 0);

  return (
    <PanelCard
      title="Assistant quality"
      lead={latest ? `Weekly exam · latest ${latest.clean}/${latest.cases} clean on ${when(latest.at)}` : runs ? 'Weekly exam · no run yet - Sunday night, or Actions → scheduled jobs → eval' : 'Loading…'}
    >
      {latest && (
        <>
          <div className="flex h-16 items-end gap-1" aria-label="Clean share per weekly run, oldest to newest">
            {runs.map((r) => (
              <div key={r._id} className="flex-1" title={`${when(r.at)}: ${r.clean}/${r.cases}`}>
                <div className={`w-full rounded-t ${share(r) >= 0.9 ? 'bg-emerald-500' : share(r) >= 0.7 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ height: `${Math.max(6, Math.round(share(r) * 64))}px` }} />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {runs.length} run{runs.length > 1 ? 's' : ''} · answered by {Object.entries(latest.byModel || {}).map(([m, n]) => `${m} ×${n}`).join(', ') || '—'}
          </p>
          {latest.failing.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {latest.failing.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.role}/{f.language}</span> · <span className="text-muted-foreground">{f.question}</span>
                  <div className="text-xs text-destructive">{f.problems.join(' · ')}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Every case clean in the latest run.</p>
          )}
        </>
      )}
    </PanelCard>
  );
}
