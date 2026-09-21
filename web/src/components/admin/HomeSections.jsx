'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/**
 * The home page's sections, arranged by the admin (Option A S1, 21 Sep 2026).
 *
 * Shopify's theme editor is the reference: a list of sections, each with a
 * type, a switch, a few fields, and up/down arrows - not a page builder. The
 * hero is fixed first (its copy is the "First screen" block above). Save is
 * the parent's Save; the storefront re-reads settings within 30 s (at once
 * when the revalidate token is set - 2.56).
 *
 * `value` is the normalised list from /admin/settings; `onChange` receives the
 * whole list. backend/utils/homeSections is the contract for every field.
 */
const TYPES = [
  { type: 'categories', label: 'Category tiles', help: 'Up to 8 tiles. Leave the picks empty for the fullest categories.' },
  { type: 'collection', label: 'Product row', help: 'Eight products: hand-picked by slug, or whatever a /shop link filters.' },
  { type: 'sellers', label: 'Shops', help: 'Up to 8 shops with three of their pieces - the row that recruits sellers.' },
  { type: 'banner', label: 'Banner', help: 'One image with a line and a link; disappears after the date.' },
  { type: 'newest', label: 'Just added', help: 'The newest pieces - shown only when there are enough to be a row.' },
];
const labelOf = (t) => TYPES.find((x) => x.type === t)?.label || t;

const fresh = (type) => ({
  type,
  enabled: true,
  title: { categories: 'Browse by category', collection: 'Picked for you', sellers: 'Shops on ShopMaster Pro', banner: '', newest: 'Just added' }[type] || '',
  ...(type === 'categories' ? { slugs: [] } : {}),
  ...(type === 'collection' ? { href: '/shop', slugs: [], until: null } : {}),
  ...(type === 'sellers' ? { ids: [] } : {}),
  ...(type === 'banner' ? { image: '', text: '', href: '/shop', until: null } : {}),
  ...(type === 'newest' ? { min: 4 } : {}),
});

const list = (v) => (Array.isArray(v) ? v.join(', ') : '');
const parseList = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export default function HomeSections({ value = [], onChange }) {
  const [adding, setAdding] = useState('collection');
  const sections = value.length ? value : [{ type: 'hero', enabled: true, title: '' }];
  const rest = sections.filter((s) => s.type !== 'hero');

  const update = (next) => onChange([{ type: 'hero', enabled: true, title: '' }, ...next]);
  const patch = (i, changes) => update(rest.map((s, k) => (k === i ? { ...s, ...changes } : s)));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= rest.length) return;
    const next = [...rest];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const remove = (i) => update(rest.filter((_, k) => k !== i));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <strong className="text-foreground">1 · Hero</strong> - always first; its words are the First screen block above.
      </div>

      {rest.map((s, i) => (
        <div key={`${s.type}-${i}`} className={`rounded-lg border p-3 ${s.enabled ? '' : 'opacity-60'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{i + 2} · {labelOf(s.type)}</span>
            <span className="ml-auto flex items-center gap-1">
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Move down" disabled={i === rest.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" aria-label="Remove section" onClick={() => remove(i)}><Trash2 className="size-3.5" /></Button>
              <Switch checked={s.enabled !== false} onCheckedChange={(v) => patch(i, { enabled: v })} aria-label="Show this section" />
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{TYPES.find((x) => x.type === s.type)?.help}</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {s.type !== 'newest' && (
              <label className="text-sm">
                <span className="text-muted-foreground">Title</span>
                <Input value={s.title || ''} onChange={(e) => patch(i, { title: e.target.value })} maxLength={60} className="mt-1" placeholder={s.type === 'banner' ? 'Optional, over the image' : ''} />
              </label>
            )}
            {s.type === 'categories' && (
              <label className="text-sm sm:col-span-2">
                <span className="text-muted-foreground">Category slugs, in order (optional)</span>
                <Input value={list(s.slugs)} onChange={(e) => patch(i, { slugs: parseList(e.target.value) })} className="mt-1" placeholder="jewellery, womens-fashion, home-kitchen" />
              </label>
            )}
            {s.type === 'collection' && (
              <>
                <label className="text-sm">
                  <span className="text-muted-foreground">Shop link with filters</span>
                  <Input value={s.href || ''} onChange={(e) => patch(i, { href: e.target.value })} className="mt-1" placeholder="/shop?search=diya&sort=newest" />
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">Show until (optional)</span>
                  <Input type="date" value={s.until || ''} onChange={(e) => patch(i, { until: e.target.value || null })} className="mt-1" />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="text-muted-foreground">Hand-picked product slugs, in order (optional - wins over the link)</span>
                  <Input value={list(s.slugs)} onChange={(e) => patch(i, { slugs: parseList(e.target.value) })} className="mt-1" placeholder="the part of the product URL after /products/, comma-separated" />
                </label>
              </>
            )}
            {s.type === 'sellers' && (
              <label className="text-sm sm:col-span-2">
                <span className="text-muted-foreground">Seller ids, in order</span>
                <Input value={list(s.ids)} onChange={(e) => patch(i, { ids: parseList(e.target.value) })} className="mt-1" placeholder="the id in each shop's /sellers/<id> address" />
              </label>
            )}
            {s.type === 'banner' && (
              <>
                <label className="text-sm sm:col-span-2">
                  <span className="text-muted-foreground">Image address (https)</span>
                  <Input value={s.image || ''} onChange={(e) => patch(i, { image: e.target.value })} className="mt-1" placeholder="https://res.cloudinary.com/…" />
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">One line under the title</span>
                  <Input value={s.text || ''} onChange={(e) => patch(i, { text: e.target.value })} maxLength={140} className="mt-1" />
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">Link</span>
                  <Input value={s.href || ''} onChange={(e) => patch(i, { href: e.target.value })} className="mt-1" placeholder="/shop?category=jewellery" />
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">Show until (optional)</span>
                  <Input type="date" value={s.until || ''} onChange={(e) => patch(i, { until: e.target.value || null })} className="mt-1" />
                </label>
              </>
            )}
            {s.type === 'newest' && (
              <label className="text-sm">
                <span className="text-muted-foreground">Show only when at least this many new pieces</span>
                <Input type="number" min={1} max={24} value={s.min ?? 4} onChange={(e) => patch(i, { min: Number(e.target.value) || 4 })} className="mt-1 w-24" />
              </label>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <select value={adding} onChange={(e) => setAdding(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" aria-label="Section type">
          {TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
        <Button type="button" size="sm" variant="outline" disabled={rest.length >= 11} onClick={() => update([...rest, fresh(adding)])}>
          <Plus className="size-3.5" /> Add section
        </Button>
        <span className="text-xs text-muted-foreground">Save with the button below; the home page follows within half a minute.</span>
      </div>
    </div>
  );
}
