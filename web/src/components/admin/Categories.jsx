'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * The category tree.
 *
 * WHY PRODUCTS CANNOT LIVE ON A PARENT
 *   The API refuses it (validateLeafCategory). A product on "Jewellery" would
 *   be invisible to anyone browsing "Rings", and the listing page rolls a
 *   parent's products up from its children - so a parent that held products
 *   directly would double-count them.
 *
 * WHY DEACTIVATING BEATS DELETING
 *   Turning a category off hides it AND everything under it, and the products
 *   keep their category so nothing is orphaned. Deleting one that still has
 *   products would leave rows pointing at nothing.
 */
export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [form, setForm] = useState({ name: '', description: '', parentCategory: '' });

  const load = async () => {
    const data = await authedFetch('/admin/categories');
    setCategories(data.categories || data || []);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/admin/categories');
        if (cancelled) return;
        setCategories(data.categories || data || []);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (fn) => {
    setState({ status: 'working' });
    try {
      await fn();
      await load();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      await authedFetch('/admin/categories', {
        method: 'POST',
        body: {
          name: form.name,
          description: form.description || undefined,
          parentCategory: form.parentCategory || undefined,
        },
      });
      setForm({ name: '', description: '', parentCategory: '' });
    });
  };

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  const parents = categories.filter((c) => !c.parentCategory);

  return (
    <div className="space-y-8">
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <form onSubmit={create} className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-semibold">Add a category</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name"
            aria-label="Category name"
          />
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            aria-label="Category description"
          />
          <select
            value={form.parentCategory}
            onChange={(e) => setForm({ ...form, parentCategory: e.target.value })}
            aria-label="Parent category"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">No parent - a top-level category</option>
            {parents.map((cat) => (
              <option key={cat._id} value={cat._id}>
                Inside {cat.name}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" disabled={state.status === 'working'}>
          Add it
        </Button>
        <p className="text-xs text-muted-foreground">
          Products can only sit on a category with nothing beneath it. Adding a
          child to a category that already holds products will strand them - move
          them first.
        </p>
      </form>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {categories.map((cat) => (
          <li key={cat._id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1">
              {cat.parentCategory ? '— ' : ''}
              {cat.name}
              {!cat.isActive && <span className="text-muted-foreground"> · switched off</span>}
              {cat.description && (
                <span className="block text-xs text-muted-foreground">{cat.description}</span>
              )}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                run(() =>
                  authedFetch(`/admin/categories/${cat._id}`, {
                    method: 'PATCH',
                    body: { isActive: !cat.isActive },
                  })
                )
              }
            >
              {cat.isActive ? 'Switch off' : 'Switch on'}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
