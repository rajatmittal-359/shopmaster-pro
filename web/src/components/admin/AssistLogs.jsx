'use client';

import { useEffect, useState } from 'react';
import { ThumbsDown, ThumbsUp, Globe } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import PanelCard from '@/components/panel/PanelCard';
import Answer from '@/components/assist/Answer';

/**
 * What people asked the assistant - the admin's read of where sellers and
 * customers get stuck, and where the assistant went wrong. Every row shows
 * the lookups the answer was built from, so a wrong number can be traced to
 * a wrong source rather than argued about. Kept 90 days on the server.
 */
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AssistLogs() {
  const [logs, setLogs] = useState(null);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      authedFetch('/admin/assist')
        .then((d) => {
          if (!cancelled) setLogs(d.logs || []);
        })
        .catch(() => {
          if (!cancelled) setLogs((l) => l || []);
        });
    load();
    window.addEventListener('smp:assist', load); // a fresh answer in the chat beside this
    return () => {
      cancelled = true;
      window.removeEventListener('smp:assist', load);
    };
  }, []);

  const rows = (logs || []).filter((l) => filter === 'all' || (filter === 'unhelpful' ? l.helpful === false : l.role === filter));
  const unhelpful = (logs || []).filter((l) => l.helpful === false).length;

  return (
    <PanelCard
      title="What people asked"
      lead={logs ? `${logs.length} questions in the last 90 days · ${unhelpful} marked not helpful` : 'Loading…'}
      aside={
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm">
          <option value="all">Everyone</option>
          <option value="seller">Sellers</option>
          <option value="customer">Customers</option>
          <option value="admin">Admin</option>
          <option value="unhelpful">Not helpful</option>
        </select>
      }
    >
      {logs && rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}
      <ul className="divide-y">
        {rows.map((l) => (
          <li key={l._id} className="py-3">
            <button type="button" onClick={() => setOpen(open === l._id ? null : l._id)} className="w-full text-left">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-medium capitalize text-foreground">{l.role}</span>
                <span>{l.userId?.name || '-'}</span>
                <span>· {when(l.createdAt)}</span>
                <span>· {l.model || 'no answer'}{l.ms ? ` · ${(l.ms / 1000).toFixed(1)}s` : ''}</span>
                {l.searchedWeb && <Globe className="size-3" aria-label="searched the web" />}
                {l.helpful === true && <ThumbsUp className="size-3 text-emerald-600" aria-label="helpful" />}
                {l.helpful === false && <ThumbsDown className="size-3 text-destructive" aria-label="not helpful" />}
                {!l.ok && <span className="text-destructive">failed</span>}
              </div>
              <p className="mt-1 text-sm font-medium [overflow-wrap:anywhere]">{l.question}</p>
            </button>
            {open === l._id && (
              <div className="mt-2 rounded-lg bg-muted/50 p-3">
                <Answer text={l.answer || '(no answer)'} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Lookups: {l.calls?.length ? l.calls.join(', ') : 'none'} · Passages: {l.retrieved?.length ? l.retrieved.join(', ') : 'none'}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </PanelCard>
  );
}
