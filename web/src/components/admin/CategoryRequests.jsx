'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Sellers asking for categories - the admin's side of the loop.
 *
 * The taxonomy stays in the platform's hands (Amazon / Flipkart / Meesho:
 * a seller picks a leaf, never creates one), so the only way a new leaf
 * appears is here: read what was asked, pick the parent if the seller's
 * guess was wrong, create in one click or say why not. The seller sees
 * the answer in their product form.
 */
const when = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function CategoryRequests({ parents, onCreated }) {
  const [requests, setRequests] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');

  const load = () =>
    authedFetch('/admin/category-requests')
      .then((d) => setRequests(d.requests || []))
      .catch((err) => toast.error(err.message));

  useEffect(() => {
    let cancelled = false;
    authedFetch('/admin/category-requests')
      .then((d) => {
        if (!cancelled) setRequests(d.requests || []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!requests) return null;
  const open = requests.filter((r) => r.status === 'open');
  const closed = requests.filter((r) => r.status !== 'open').slice(0, 8);
  if (requests.length === 0) return null;

  const decide = async (r, action) => {
    const d = drafts[r._id] || {};
    setBusy(r._id);
    try {
      await authedFetch(`/admin/category-requests/${r._id}`, { method: 'PATCH', body: { action, parentCategory: d.parent || r.parentCategory?._id, reply: d.reply } });
      toast.success(action === 'create' ? `"${r.name}" added` : 'Request closed');
      await load();
      if (action === 'create') onCreated?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <PanelCard
      title={`Category requests${open.length ? ` · ${open.length} waiting` : ''}`}
      lead="A seller could not find the right leaf. Create it under the right main category, or say why not - they see the answer in their form."
    >
      {open.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting.</p>}
      <ul className="divide-y">
        {open.map((r) => {
          const d = drafts[r._id] || {};
          return (
            <li key={r._id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">
                  <strong>{r.name}</strong>
                  <span className="text-muted-foreground">
                    {' '}
                    · {r.shop || 'a seller'} · {when(r.createdAt)}
                  </span>
                </p>
                {r.note && <p className="text-xs text-muted-foreground">“{r.note}”</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={d.parent || r.parentCategory?._id || ''}
                  onChange={(e) => setDrafts({ ...drafts, [r._id]: { ...d, parent: e.target.value } })}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  aria-label="Main category"
                >
                  <option value="">Under which main category?</option>
                  {parents.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={d.reply || ''}
                  onChange={(e) => setDrafts({ ...drafts, [r._id]: { ...d, reply: e.target.value } })}
                  placeholder="A word back to the seller (optional)"
                  className="h-9 max-w-xs"
                />
                <Button size="sm" disabled={busy === r._id} onClick={() => decide(r, 'create')}>
                  Create
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === r._id} onClick={() => decide(r, 'decline')}>
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {closed.length > 0 && (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Recently decided</summary>
          <ul className="mt-2 space-y-1">
            {closed.map((r) => (
              <li key={r._id}>
                {r.name} · {r.shop} · {r.status === 'created' ? `added under ${r.createdCategory?.name ? r.parentCategory?.name || '' : ''}`.trim() || 'added' : 'declined'} · {when(r.decidedAt || r.updatedAt)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </PanelCard>
  );
}
