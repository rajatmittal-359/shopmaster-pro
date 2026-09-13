'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * "Can't find the right category?" - under the picker in the product form.
 *
 * The seller cannot create a category (see models/CategoryRequest for why);
 * they can ask, and the answer comes back right here. Kept small on
 * purpose: a name, the main category it belongs under, one line of why.
 */
export default function SuggestCategory({ parents }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', parentCategory: '', note: '' });
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/category-requests')
      .then((d) => {
        if (!cancelled) setMine(d.requests || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await authedFetch('/seller/category-requests', { method: 'POST', body: form });
      setMine([d.request, ...mine]);
      setForm({ name: '', parentCategory: '', note: '' });
      setOpen(false);
      toast.success('Asked. The admin usually answers within a day - the answer shows here.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const recent = mine.slice(0, 3);

  return (
    <div className="mt-2 text-xs">
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="text-brand-ink hover:underline">
          Can&apos;t find the right one? Suggest a category
        </button>
      )}
      {open && (
        <form onSubmit={send} className="mt-2 grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Category name, e.g. Kamarbandh" required maxLength={60} className="h-9 text-sm" />
          <select value={form.parentCategory} onChange={(e) => setForm({ ...form, parentCategory: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm" aria-label="Main category">
            <option value="">Under which main category?</option>
            {parents.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1">
            <Button type="submit" size="sm" disabled={busy || !form.name.trim()}>
              Ask
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="One line on what you sell in it (optional)" maxLength={300} className="h-9 text-sm sm:col-span-3" />
        </form>
      )}
      {recent.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-muted-foreground">
          {recent.map((r) => (
            <li key={r._id}>
              <span className="font-medium text-foreground">{r.name}</span>
              {' · '}
              {r.status === 'open' ? 'with the admin' : r.status === 'created' ? <span className="text-emerald-700 dark:text-emerald-300">added - type it above</span> : <span>not added{r.reply ? ` - ${r.reply}` : ''}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
