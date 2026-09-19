'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { clearSession } from '@/lib/session';
import { Button } from '@/components/ui/button';

/**
 * Where this account is signed in (19 Sep 2026 - sessions).
 *
 * Amazon's "Manage your devices", Google's "Your devices": every live
 * session as a readable line - browser, system, when - with a way to end
 * one, and one button that ends them all (which also kills every access
 * token through the tokenVersion bump). The first thing a person reaches
 * for after "that sign-in was not me".
 */
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function Devices() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => authedFetch('/auth/sessions').then((d) => setRows(d.sessions || [])).catch(() => setRows([])), []);
  useEffect(() => {
    load();
  }, [load]);

  const endOne = async (id) => {
    setBusy(id);
    try {
      await authedFetch(`/auth/sessions/${id}`, { method: 'DELETE' });
      toast.success('That device has been signed out');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const endAll = async () => {
    setBusy('all');
    try {
      await authedFetch('/auth/logout-all', { method: 'POST' });
      clearSession();
      toast('Signed out everywhere. Sign in again on this device.');
      router.push('/login?next=/account');
      router.refresh();
    } catch (err) {
      toast.error(err.message);
      setBusy('');
    }
  };

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Where you are signed in</h2>
      <p className="mt-1 text-sm text-muted-foreground">Every device with an open session. A sign-in from a device you do not recognise: end it, then change your password.</p>
      {rows === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="mt-3 divide-y text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.device}</span>
                {r.current && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">this device</span>}
                <span className="block text-xs text-muted-foreground">
                  {r.ip ? `${r.ip} · ` : ''}since {when(r.since)} · last used {when(r.lastUsedAt)}
                </span>
              </span>
              {!r.current && (
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => endOne(r.id)}>
                  {busy === r.id ? 'Ending…' : 'Sign out'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" className="mt-4" disabled={busy === 'all'} onClick={endAll}>
        {busy === 'all' ? 'Signing out…' : 'Sign out of every device'}
      </Button>
    </section>
  );
}
