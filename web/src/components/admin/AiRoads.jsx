'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import PanelCard from '@/components/panel/PanelCard';

/**
 * "AI today" for the admin (plan 2.34): the roads in the order they are
 * tried, which are out of quota right now, and who answered how often.
 * The seller never sees this - they get "Automatic" and a name under each
 * draft. One glance, no controls: the order is the code's, the quotas are
 * the providers'.
 */
const TONE = {
  ok: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  quota: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  off: 'bg-muted text-muted-foreground',
};
const LABEL = { ok: 'ready', quota: 'out for now', off: 'no key' };

export default function AiRoads() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let cancelled = false;
    authedFetch('/admin/ai/roads')
      .then((r) => !cancelled && setD(r))
      .catch((e) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const total = d ? Object.values(d.answeredBy || {}).reduce((n, v) => n + v, 0) : 0;

  return (
    <PanelCard title="AI today" lead="Roads in the order they are tried. When one is out, the next answers - nobody waits.">
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!d && !err && <p className="text-sm text-muted-foreground">Reading…</p>}
      {d && (
        <>
          <ol className="divide-y text-sm">
            {d.roads.map((r, i) => (
              <li key={r.key} className="flex flex-wrap items-start gap-2 py-2">
                <span className="w-5 shrink-0 text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{r.note}</span>
                </span>
                <span className={`rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${TONE[r.status] || TONE.off}`}>{LABEL[r.status] || r.status}</span>
              </li>
            ))}
          </ol>
          {d.voice && (
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Voice</span>{' '}
              {d.voice.map((v, i) => (
                <span key={v.key}>
                  {i > 0 && ' → '}
                  <span className={v.status === 'ok' ? '' : 'line-through'} title={v.note}>{v.name.replace(' large-v3-turbo', '')}</span>
                </span>
              ))}
              {' · '}the same clip walks the roads until one hears words
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Answered today ({total}):{' '}
            {Object.entries(d.answeredBy || {}).length === 0 ? 'nothing yet' : Object.entries(d.answeredBy).map(([k, v]) => `${k} ${v}`).join(' · ')}
            {' · '}
            <a href="https://dash.cloudflare.com/?to=/:account/ai/ai-gateway" target="_blank" rel="noreferrer" className="text-brand-ink hover:underline">every call, in Cloudflare</a>
          </p>
        </>
      )}
    </PanelCard>
  );
}
