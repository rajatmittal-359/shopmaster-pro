'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ArrowDown, ArrowUp, Check, Plus, Search, Trash2, X } from 'lucide-react';
import { apiBase } from '@/lib/api';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/**
 * The home page as a list the admin arranges (Option A, S1 - 21 Sep 2026).
 *
 * S2 (22 Sep 2026), from Shopify's theme editor and Wix's section list:
 *   - PICKERS instead of typed ids. Categories are ticked from the tree,
 *     products are searched by name (the storefront's own suggest endpoint)
 *     and added as chips with their photo, shops are ticked from the seller
 *     list. Nobody copies a slug out of a URL any more; the old text field
 *     stays behind "Paste slugs instead" for the person who prefers it.
 *   - A LIVE PREVIEW beside the list: a phone-width sketch of the page as it
 *     will be, redrawn on every change before anything is saved - the order,
 *     the titles, the picked tiles and photos, a banner's image. Not the
 *     storefront's own rendering (that needs its data and its cache); the
 *     "Open the home page" link is for that, after Save.
 *   - The reviews section (S4).
 *
 * Nothing here writes: `onChange` hands the list up and the Save button in
 * PlatformSettings sends it; utils/homeSections on the API decides the final
 * shape, so a bad pick can never break the page.
 */
const TYPES = [
  { type: 'categories', label: 'Category tiles', help: 'Up to 8 tiles. Leave the picks empty for the fullest categories.' },
  { type: 'collection', label: 'Product row', help: 'Eight products: hand-picked, or whatever a /shop link filters.' },
  { type: 'sellers', label: 'Shops', help: 'Up to 8 shops with three of their pieces - the row that recruits sellers.' },
  { type: 'banner', label: 'Banner', help: 'One image with a line and a link; disappears after the date.' },
  { type: 'newest', label: 'Just added', help: 'The newest pieces - shown only when there are enough to be a row.' },
  { type: 'reviews', label: 'What customers say', help: 'The newest good reviews, each on its product. Hidden until there are three.' },
];
const labelOf = (t) => TYPES.find((x) => x.type === t)?.label || t;

const fresh = (type) => ({
  type,
  enabled: true,
  title: { categories: 'Browse by category', collection: 'Picked for you', sellers: 'Shops on ShopMaster Pro', banner: '', newest: 'Just added', reviews: 'What customers say' }[type] || '',
  ...(type === 'categories' ? { slugs: [] } : {}),
  ...(type === 'collection' ? { href: '/shop', slugs: [], until: null } : {}),
  ...(type === 'sellers' ? { ids: [] } : {}),
  ...(type === 'banner' ? { image: '', text: '', href: '/shop', until: null } : {}),
  ...(type === 'newest' ? { min: 4 } : {}),
  ...(type === 'reviews' ? { count: 6, minRating: 4 } : {}),
});

const list = (v) => (Array.isArray(v) ? v.join(', ') : '');
const parseList = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const flattenTree = (nodes, depth = 0, out = []) => {
  for (const n of nodes || []) {
    out.push({ slug: n.slug, name: n.name, depth, count: n.productCount || 0 });
    flattenTree(n.children, depth + 1, out);
  }
  return out;
};

/** Ticked chips from a fixed list, kept in the order they were ticked (that is the order on the page). */
function TickPicker({ options, value, onChange, max = 8, label, empty }) {
  const [q, setQ] = useState('');
  const shown = options.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
  const toggle = (v) => {
    if (value.includes(v)) return onChange(value.filter((x) => x !== v));
    if (value.length >= max) return undefined;
    return onChange([...value, v]);
  };
  return (
    <div className="text-sm sm:col-span-2">
      <span className="text-muted-foreground">{label}</span>
      {options.length > 8 && (
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" className="pl-8" />
        </div>
      )}
      <ul className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {shown.length === 0 && <li className="text-xs text-muted-foreground">{empty || 'Nothing to pick yet.'}</li>}
        {shown.map((o) => {
          const on = value.includes(o.value);
          const order = on ? value.indexOf(o.value) + 1 : null;
          return (
            <li key={o.value}>
              <button type="button" onClick={() => toggle(o.value)} aria-pressed={on} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-primary bg-primary/10 text-brand-ink' : 'border-border hover:border-primary/50'} ${o.depth ? 'ml-2' : ''}`}>
                {on && <span className="grid size-4 place-items-center rounded-full bg-primary text-[0.6rem] text-primary-foreground">{order}</span>}
                {o.name}
                {o.note != null && <span className="text-muted-foreground">· {o.note}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">{value.length}/{max} picked, in that order.</p>
    </div>
  );
}

/** Search-and-add chips for products: the storefront's own suggestions, by name, with the photo. */
function ProductPicker({ value, onChange, cache, remember, max = 8 }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  useEffect(() => {
    // Short query: clear on the next tick (no setState in the effect body), else search after a pause.
    const t = setTimeout(() => {
      if (q.trim().length < 2) { setHits([]); return; }
      fetch(`${apiBase}/public/products/suggest?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : { products: [] }))
        .then((d) => { setHits(d.products || []); (d.products || []).forEach(remember); })
        .catch(() => setHits([]));
    }, q.trim().length < 2 ? 0 : 250);
    return () => clearTimeout(t);
  }, [q, remember]);
  return (
    <div className="text-sm sm:col-span-2">
      <span className="text-muted-foreground">Hand-picked products, in order (optional - wins over the link)</span>
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.map((slug, i) => {
            const p = cache[slug];
            return (
              <li key={slug} className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 py-0.5 pl-0.5 pr-2 text-xs text-brand-ink">
                <span className="relative size-6 overflow-hidden rounded-full bg-muted">{p?.image && <Image src={p.image} alt="" fill sizes="24px" className="object-cover" unoptimized />}</span>
                <span className="max-w-40 truncate">{i + 1}. {p?.name || slug}</span>
                <button type="button" onClick={() => onChange(value.filter((s) => s !== slug))} aria-label={`Remove ${p?.name || slug}`} className="ml-0.5 text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={value.length >= max ? 'Eight picked - remove one to add another' : 'Search a product by name…'} disabled={value.length >= max} className="pl-8" />
        {hits.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
            {hits.map((p) => {
              const on = value.includes(p.slug);
              return (
                <li key={p._id}>
                  <button type="button" disabled={on} onClick={() => { onChange([...value, p.slug]); setQ(''); setHits([]); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50">
                    <span className="relative size-8 shrink-0 overflow-hidden rounded bg-muted">{p.image && <Image src={p.image} alt="" fill sizes="32px" className="object-cover" unoptimized />}</span>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground">₹{Number(p.salePrice || p.price).toLocaleString('en-IN')}</span>
                    {on && <Check className="size-4 text-brand-ink" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A phone-width sketch of the page as saved settings would draw it. */
function Preview({ sections, cats, sellers, products, heroTitle }) {
  const catName = (slug) => cats.find((c) => c.slug === slug)?.name || slug;
  const sellerName = (id) => sellers.find((s) => s.value === id)?.name || id.slice(-6);
  const Tile = ({ children, className = '' }) => <div className={`rounded-md bg-muted text-[0.55rem] leading-tight text-muted-foreground ${className}`}>{children}</div>;
  return (
    <div className="mx-auto w-[240px] rounded-[1.4rem] border-4 border-foreground/80 bg-background p-2 shadow-xl">
      <div className="space-y-2">
        <div className="rounded-lg bg-primary/15 p-2">
          <p className="text-[0.5rem] uppercase tracking-wide text-brand-ink">ShopMaster Pro</p>
          <p className="font-display text-[0.7rem] leading-tight">{heroTitle || 'Everything from sellers across India'}</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1">{[0, 1, 2].map((i) => <div key={i} className="h-8 rounded bg-primary/25" />)}</div>
        </div>
        {sections.filter((s) => s.type !== 'hero').map((s, i) => (
          <div key={`${s.type}-${i}`} className={`rounded-lg border border-dashed border-border p-1.5 ${s.enabled === false ? 'opacity-30' : ''}`}>
            <p className="mb-1 truncate text-[0.6rem] font-medium">{s.title || labelOf(s.type)}</p>
            {s.type === 'categories' && (
              <div className="grid grid-cols-2 gap-1">
                {(s.slugs?.length ? s.slugs : [...cats].sort((a, b) => b.count - a.count).slice(0, 4).map((c) => c.slug)).slice(0, 4).map((slug) => <Tile key={slug} className="flex aspect-[4/3] items-end p-1">{catName(slug)}</Tile>)}
              </div>
            )}
            {(s.type === 'collection' || s.type === 'newest') && (
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 4 }).map((_, k) => {
                  const p = s.type === 'collection' ? products[s.slugs?.[k]] : null;
                  return <Tile key={k} className="relative aspect-square overflow-hidden">{p?.image && <Image src={p.image} alt="" fill sizes="48px" className="object-cover" unoptimized />}</Tile>;
                })}
              </div>
            )}
            {s.type === 'sellers' && (
              <div className="grid grid-cols-2 gap-1">
                {(s.ids?.length ? s.ids : ['a', 'b']).slice(0, 4).map((id) => <Tile key={id} className="p-1"><span className="block truncate font-medium text-foreground">{s.ids?.length ? sellerName(id) : 'A shop'}</span><span className="mt-1 grid grid-cols-3 gap-0.5">{[0, 1, 2].map((k) => <span key={k} className="block aspect-square rounded-sm bg-foreground/10" />)}</span></Tile>)}
              </div>
            )}
            {s.type === 'banner' && (
              <Tile className="relative aspect-[16/6] overflow-hidden">
                {s.image && /^https:\/\//.test(s.image) && <Image src={s.image} alt="" fill sizes="220px" className="object-cover" unoptimized />}
                {(s.title || s.text) && <span className="absolute inset-x-0 bottom-0 bg-black/50 p-1 text-white">{s.title || s.text}</span>}
              </Tile>
            )}
            {s.type === 'reviews' && (
              <div className="grid grid-cols-2 gap-1">
                {[0, 1].map((k) => <Tile key={k} className="p-1"><span className="text-brand-ink">★★★★★</span><span className="mt-0.5 block h-1 rounded bg-foreground/10" /><span className="mt-0.5 block h-1 w-2/3 rounded bg-foreground/10" /></Tile>)}
              </div>
            )}
          </div>
        ))}
        <div className="rounded-lg bg-muted/60 p-1.5 text-[0.55rem] text-muted-foreground">The shop behind it · footer</div>
      </div>
    </div>
  );
}

export default function HomeSections({ value = [], onChange, heroTitle = '' }) {
  const [adding, setAdding] = useState('collection');
  const [paste, setPaste] = useState({}); // section index -> true when "paste slugs" is open
  const [cats, setCats] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [products, setProducts] = useState({}); // slug -> { name, image }
  const sections = value.length ? value : [{ type: 'hero', enabled: true, title: '' }];
  const rest = sections.filter((s) => s.type !== 'hero');

  // The pickers' lists, once.
  useEffect(() => {
    fetch(`${apiBase}/public/products/categories/tree`).then((r) => (r.ok ? r.json() : {})).then((d) => setCats(flattenTree(d.categories || d.tree || []))).catch(() => {});
    authedFetch('/admin/sellers/pending').then((d) => {
      const rows = (d.sellers || d || []).filter((x) => x?.userId).map((x) => ({ value: String(x.userId._id || x.userId), name: x.businessName || x.userId.name || 'Shop', note: x.status && x.status !== 'active' ? x.status : null }));
      setSellers(rows);
    }).catch(() => {});
  }, []);
  // Names and photos for slugs that were saved earlier (the chips need them).
  const missing = useMemo(() => rest.flatMap((s) => (s.type === 'collection' ? s.slugs || [] : [])).filter((slug) => !products[slug]), [rest, products]);
  useEffect(() => {
    if (!missing.length) return undefined;
    let cancelled = false;
    Promise.all(missing.slice(0, 16).map((slug) => fetch(`${apiBase}/public/products/${encodeURIComponent(slug)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)))
      .then((docs) => {
        if (cancelled) return;
        const next = {};
        docs.forEach((d, i) => { next[missing[i]] = d?.product ? { name: d.product.name, image: d.product.images?.[0] || null } : { name: missing[i], image: null }; });
        setProducts((prev) => ({ ...prev, ...next }));
      });
    return () => { cancelled = true; };
  }, [missing]);
  const remember = useMemo(() => (p) => setProducts((prev) => (prev[p.slug] ? prev : { ...prev, [p.slug]: { name: p.name, image: p.image || null } })), []);

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
  // Fullest first - the ones a home page would actually show; empty ones at the end.
  const catOptions = [...cats].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((c) => ({ value: c.slug, name: c.name, depth: 0, note: c.count }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
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
                <TickPicker options={catOptions} value={s.slugs || []} onChange={(slugs) => patch(i, { slugs })} label="Tiles, in order (optional - empty means the fullest eight)" empty="Categories are loading…" />
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
                  <ProductPicker value={s.slugs || []} onChange={(slugs) => patch(i, { slugs })} cache={products} remember={remember} />
                  <div className="text-xs sm:col-span-2">
                    <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setPaste((p) => ({ ...p, [i]: !p[i] }))}>{paste[i] ? 'Hide the slug field' : 'Paste slugs instead'}</button>
                    {paste[i] && <Input value={list(s.slugs)} onChange={(e) => patch(i, { slugs: parseList(e.target.value) })} className="mt-1" placeholder="the part of the product URL after /products/, comma-separated" />}
                  </div>
                </>
              )}

              {s.type === 'sellers' && (
                <TickPicker options={sellers} value={s.ids || []} onChange={(ids) => patch(i, { ids })} label="Shops, in order" empty="No shops yet." />
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

              {s.type === 'reviews' && (
                <>
                  <label className="text-sm">
                    <span className="text-muted-foreground">How many (3-8)</span>
                    <Input type="number" min={3} max={8} value={s.count ?? 6} onChange={(e) => patch(i, { count: Number(e.target.value) || 6 })} className="mt-1 w-24" />
                  </label>
                  <label className="text-sm">
                    <span className="text-muted-foreground">Stars, at least</span>
                    <select value={s.minRating ?? 4} onChange={(e) => patch(i, { minRating: Number(e.target.value) })} className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-sm">
                      {[5, 4, 3].map((n) => <option key={n} value={n}>{n}★ and up</option>)}
                    </select>
                  </label>
                </>
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

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-center text-xs text-muted-foreground">Preview - the order and picks as they will draw</p>
        <Preview sections={sections} cats={cats} sellers={sellers} products={products} heroTitle={heroTitle} />
        <p className="mt-2 text-center text-xs"><a href="/" target="_blank" rel="noreferrer" className="text-brand-ink hover:underline">Open the home page</a> - after Save</p>
      </aside>
    </div>
  );
}
