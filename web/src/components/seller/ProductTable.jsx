'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExternalLink, Eye, EyeOff, ImagePlus, MoreHorizontal, Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { scoreListing } from '@/lib/listingScore';
import WhatsAppCatalog from '@/components/seller/WhatsAppCatalog';
import { useT } from '@/lib/i18n';

/**
 * Everything this seller has listed, and the one number they change daily.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Shopify's Products: tabs by state (All / Active / Draft) with counts, a
 *   search box, one row per product with picture, title, status badge and
 *   "N in stock", and the row itself opens the editor. Seller Central's
 *   Manage Inventory adds the thing Shopify makes you open a page for:
 *   editing the quantity in the row. Ours keeps that - stock is the field a
 *   shop touches every day, so it stays inline.
 *
 * THE ROW SAYS IT CAN BE EDITED (15 Sep 2026)
 *   Rajat, on a screenshot: "pata nahi chal raha ki product edit ho sakta
 *   hai". Shopify's row is a link but also lifts on hover and its title
 *   underlines; Seller Central puts an explicit Edit button at the row's end
 *   with a caret for the rest. Ours does both: a pencil appears beside the
 *   name on hover, "Edit" and a ⋯ menu (Add a size, View in shop, Hide/Show)
 *   sit at the end, and a product without a photo shows a dashed "Add photo"
 *   tile instead of a blank square. Amazon's Listing Quality Dashboard adds
 *   the one more thing a list can do: flag the products that need work. A
 *   listing under 80 carries its score and its best next fix as a link that
 *   opens the editor on that field.
 *
 * WHY "SELLABLE" IS SHOWN NEXT TO STOCK
 *   Units held in open checkouts are not sellable yet and not sold yet. A
 *   seller who sees 5 in stock and 5 held should not be surprised by "out of
 *   stock" on their own product page.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const sellable = (p) => Math.max(0, (p.stock || 0) - (p.reserved || 0));

const TABS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'live', label: 'Live', test: (p) => p.isActive && sellable(p) > 0 },
  { id: 'out', label: 'Out of stock', test: (p) => p.isActive && sellable(p) === 0 },
  { id: 'hidden', label: 'Hidden', test: (p) => !p.isActive },
];

const EMPTY = {
  all: 'Nothing listed yet.',
  live: 'Nothing is live right now.',
  out: 'Nothing is out of stock.',
  hidden: 'Nothing is hidden from the shop.',
};

// Where a fix lands in the editor: the fold or the field with that id.
const FIELD_ANCHOR = { images: 'photos', name: 'name', description: 'description', category: 'category-card', color: 'details', gender: 'details', size: 'details', brand: 'details', weight: 'price-card', tags: 'tags', faqs: 'faqs' };

function Readiness({ product }) {
  const t = useT();
  const { score, fixes } = scoreListing({ ...product, category: product.category?._id || product.category });
  if (score >= 80 || !fixes.length) return null;
  const next = fixes[0];
  const tone = score >= 50 ? 'text-amber-700 dark:text-amber-300' : 'text-destructive';
  return (
    <Link href={`/seller/products/${product._id}#${FIELD_ANCHOR[next.field] || next.field}`} className={`inline-flex max-w-full items-center gap-1.5 text-xs ${tone} hover:underline`} title={t('Listing score {n} of 100 - above 80 is where listings start to show', { n: score })}>
      <span className="font-semibold tabular-nums">{score}/100</span>
      <span className="truncate text-muted-foreground">{t(next.text).split(' - ')[0]}</span>
      <span className="shrink-0 rounded bg-primary/10 px-1 font-semibold tabular-nums text-brand-ink">+{next.points}</span>
    </Link>
  );
}

function StatusBadge({ product }) {
  const t = useT();
  if (!product.isActive) return <Badge variant="outline">{t('Hidden')}</Badge>;
  const left = sellable(product);
  if (left === 0) return <Badge variant="destructive">{t('Out of stock')}</Badge>;
  if (left <= (product.lowStockThreshold || 10)) {
    return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">{t('Low · {n} left', { n: left })}</Badge>;
  }
  return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">{t('Live')}</Badge>;
}

export default function ProductTable() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'all';

  const [products, setProducts] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [q, setQ] = useState('');

  const load = () =>
    authedFetch('/seller/products').then((data) => {
      setProducts(data.products || []);
      setState({ status: 'idle' });
    });

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/products')
      .then((data) => {
        if (cancelled) return;
        setProducts(data.products || []);
        setState({ status: 'idle' });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'all') next.delete('tab');
    else next.set('tab', id);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const counts = useMemo(() => Object.fromEntries(TABS.map((x) => [x.id, products.filter(x.test).length])), [products]);

  const shown = useMemo(() => {
    const test = TABS.find((x) => x.id === tab).test;
    const needle = q.trim().toLowerCase();
    return products.filter(test).filter((p) => !needle || [p.name, p.sku, p.size].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [products, tab, q]);

  /*
   * Hide or show without opening the editor. Reversible, so no confirmation -
   * an Undo on the toast, as the house rule says for anything not costly.
   */
  const toggleActive = async (product, next = !product.isActive) => {
    const before = products;
    setProducts((list) => list.map((p) => (p._id === product._id ? { ...p, isActive: next } : p)));
    try {
      await authedFetch(`/seller/products/${product._id}`, { method: 'PATCH', body: { isActive: next } });
      toast(next ? `${product.name} is back in the shop` : `${product.name} is hidden from the shop`, {
        action: { label: 'Undo', onClick: () => toggleActive({ ...product, isActive: next }, !next) },
      });
    } catch (err) {
      setProducts(before);
      toast.error(err.message || 'Could not change it');
    }
  };

  const saveStock = async (product) => {
    const value = edits[product._id];
    if (value === undefined || value === '') return;
    setSaving(product._id);
    try {
      await authedFetch(`/seller/products/${product._id}/stock`, {
        method: 'PATCH',
        body: { stock: Number(value), reason: 'Counted by the seller' },
      });
      setEdits((current) => ({ ...current, [product._id]: undefined }));
      await load();
      toast.success(`${product.name}: stock is now ${Number(value)}`, {
        description: 'Written to the stock history.',
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(null);
    }
  };

  if (state.status === 'loading') return <TableSkeleton />;
  if (state.status === 'error') {
    return (
      <PanelCard>
        <p className="text-sm text-destructive">{state.message}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => load().catch((e) => toast.error(e.message))}>
          Try again
        </Button>
      </PanelCard>
    );
  }

  if (products.length === 0) {
    return (
      <PanelCard>
        <div className="py-8 text-center">
          <p className="font-medium">Nothing listed yet</p>
          <p className="mt-1 text-sm text-muted-foreground">One photo is enough to start - the AI can write the listing.</p>
          <Button className="mt-4" nativeButton={false} render={<Link href="/seller/products/new" />}>
            List your first product
          </Button>
        </div>
      </PanelCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Product state" className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
          {TABS.map((tb) => {
            const active = tb.id === tab;
            return (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(tb.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition ${
                  active ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(tb.label)}
                <span className={`tabular-nums ${active ? 'text-brand-ink' : ''}`}>{counts[tb.id]}</span>
              </button>
            );
          })}
        </div>
        {/* The shop's own WhatsApp is its marketing channel; the links point back here. */}
        <WhatsAppCatalog products={products} />
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border bg-background px-3 sm:w-64">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Name, SKU or size')}
            aria-label="Search your products"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <PanelCard>
          <p className="py-8 text-center text-sm text-muted-foreground">
            {q.trim() ? t('Nothing here matches “{q}”.', { q: q.trim() }) : t(EMPTY[tab])}
          </p>
        </PanelCard>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {shown.map((product) => {
            const edited = edits[product._id];
            const dirty = edited !== undefined && String(edited) !== String(product.stock);
            return (
              <li key={product._id} className="group flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-accent/40 sm:gap-4">
                {product.images?.[0] ? (
                  <Link href={`/seller/products/${product._id}`} aria-label={`Edit ${product.name}`} className="relative size-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                    <Image src={product.images[0]} alt="" fill sizes="56px" className="object-cover" />
                  </Link>
                ) : (
                  <Link href={`/seller/products/${product._id}#photos`} className="grid size-14 shrink-0 place-items-center rounded-lg border border-dashed border-destructive/50 text-destructive hover:bg-destructive/5" title={t('No photo - add one')}>
                    <ImagePlus className="size-5" aria-hidden />
                    <span className="sr-only">Add a photo</span>
                  </Link>
                )}

                {/* min-w keeps the words readable on a phone: the actions wrap
                    under the row instead of squeezing the name to one word a line. */}
                <div className="min-w-[11rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* The row opens the editor, as Shopify's does - and says so. */}
                    <Link href={`/seller/products/${product._id}`} className="inline-flex items-center gap-1.5 font-medium hover:text-brand-ink hover:underline">
                      {product.name}
                      <Pencil className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </Link>
                    <StatusBadge product={product} />
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    <span className="tabular-nums">{money(product.price)}</span>
                    {product.size ? ` · size ${product.size}` : ''}
                    {product.sku ? ` · ${product.sku}` : ''}
                    {product.reserved > 0 ? ` · ${t('{n} held in checkouts', { n: product.reserved })}` : ''}
                  </p>
                  <Readiness product={product} />
                </div>

                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <label className="sr-only" htmlFor={`stock-${product._id}`}>
                    Stock for {product.name}
                  </label>
                  <Input
                    id={`stock-${product._id}`}
                    inputMode="numeric"
                    value={edited ?? product.stock ?? 0}
                    onChange={(e) => setEdits({ ...edits, [product._id]: e.target.value.replace(/\D/g, '') })}
                    onKeyDown={(e) => e.key === 'Enter' && dirty && saveStock(product)}
                    className="w-20 text-right tabular-nums"
                  />
                  <Button onClick={() => saveStock(product)} disabled={!dirty || saving === product._id} variant="outline" size="sm">
                    {saving === product._id ? t('Saving…') : t('Save')}
                  </Button>
                  <Button render={<Link href={`/seller/products/${product._id}`} />} nativeButton={false} variant="outline" size="sm" className="ml-auto">
                    <Pencil className="size-3.5" />
                    {t('Edit')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label={`More for ${product.name}`} className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground">
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {/* Clothing and shoes need a row per size - Google requires
                          `size` and disapproves without it. This copies the style
                          so only the size and the count are typed. */}
                      <DropdownMenuItem render={<Link href={`/seller/products/new?from=${product._id}`} />}>
                        <Plus className="size-4" />
                        {t('Add a size or colour')}
                      </DropdownMenuItem>
                      <DropdownMenuItem render={<Link href={`/products/${product.slug || product._id}`} target="_blank" rel="noreferrer" />}>
                        <ExternalLink className="size-4" />
                        {t('View in shop')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => toggleActive(product)}>
                        {product.isActive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        {t(product.isActive ? 'Hide from shop' : 'Show in shop')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="skeleton-in space-y-4" aria-busy="true" aria-label="Loading products">
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-80 rounded-lg" />
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>
      <div className="divide-y rounded-xl border bg-card">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="size-14 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
