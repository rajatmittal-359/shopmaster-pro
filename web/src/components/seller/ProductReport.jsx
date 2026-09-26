'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ExternalLink, Pencil } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { scoreListing } from '@/lib/listingScore';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';
import GoogleStatus from '@/components/seller/GoogleStatus';

/**
 * One listing's report: everything ABOUT the product, none of the product.
 *
 * WHY IT EXISTS (27 Sep 2026, Rajat's idea)
 *   "Ek about page ho seller ke paas bhi product ka, jisme bare hue product ki
 *   report - preview aur score ya fix aur aur bhi. Product ki exact info to
 *   edit mode me dikh jati hai, usko chhod ke."
 *
 *   The edit form had been quietly collecting things nobody could fill - a
 *   Google preview, Google's verdicts - because there was nowhere else to put
 *   them. Numbering them as step 8 made the form promise work it did not have
 *   (plan §4.61). This is the somewhere else.
 *
 * THE REFERENCE
 *   Etsy, whose sellers are the closest thing to ours: open a listing and get
 *   its own Stats - views, favourites, orders, revenue, and where the traffic
 *   came from. eBay hangs prompts off the listings TABLE instead; Amazon gives
 *   per-ASIN rows inside account dashboards and no page at all, because at
 *   millions of ASINs a page each is useless; Shopify keeps product analytics
 *   in Reports, away from the product. A page per product is a SMALL
 *   marketplace's move - cheap for us, impossible for Amazon. We have three
 *   sellers, so we can afford to treat each listing as a thing worth a page.
 *
 * THE DIVISION OF LABOUR
 *   Edit = the facts of the product, and only what can be typed.
 *   Report = what happened to it. Money, visitors, Google. Nothing to fill.
 */
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const onDay = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function Stat({ label, value, note }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export default function ProductReport({ productId }) {
  const [data, setData] = useState(null);
  const [google, setGoogle] = useState(null);
  const [error, setError] = useState('');
  const t = useT();

  useEffect(() => {
    let dead = false;
    authedFetch(`/seller/products/${productId}/report`)
      .then((d) => {
        if (!dead) setData(d);
      })
      .catch((e) => {
        if (!dead) setError(e.message);
      });
    // Google's answer is slower and may not come at all (the APIs can be
    // unreachable); the page must not wait for it to render anything.
    authedFetch(`/seller/products/${productId}/google`)
      .then((d) => {
        if (!dead) setGoogle(d);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [productId]);

  const product = data?.product;

  const { score, fixes } = useMemo(
    () =>
      product
        ? scoreListing({ ...product, category: product.category?._id || product.category })
        : { score: 0, fixes: [] },
    [product]
  );

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <Skeleton className="h-64 w-full" />;

  const { sales, views, viewsSince } = data;
  const categoryLabel = product.category?.name;
  const ring = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  const tone = score >= 80 ? 'text-emerald-700 dark:text-emerald-300' : score >= 50 ? 'text-amber-700 dark:text-amber-300' : 'text-destructive';

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" render={<Link href="/seller/products" />} nativeButton={false}>
          <ArrowLeft className="size-4" aria-hidden /> {t('All products')}
        </Button>
        <span className="flex-1" />
        <Button variant="outline" size="sm" render={<Link href={`/seller/products/${productId}`} />} nativeButton={false}>
          <Pencil className="size-4" aria-hidden /> {t('Edit the listing')}
        </Button>
      </div>

      <div className="flex items-start gap-4">
        {product.images?.[0] && (
          <Image src={product.images[0]} alt="" width={72} height={72} className="size-18 shrink-0 rounded-lg object-cover" unoptimized />
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rupees(product.price)}
            {categoryLabel ? ` · ${categoryLabel}` : ''}
            {product.isActive ? '' : ` · ${t('not on the site')}`}
          </p>
          <a
            href={`https://www.shopmasterpro.in/products/${product.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-brand-ink hover:underline"
          >
            {t('See it as a shopper does')} <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
      </div>

      {/* MONEY AND VISITORS - the reason a seller opens this page at all. */}
      <PanelCard title={t('What this listing has done')}>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label={t('Sold')} value={sales.units} note={sales.orders ? t('in {n} orders', { n: sales.orders }) : t('no orders yet')} />
          <Stat label={t('Earned')} value={rupees(sales.revenue)} note={t('at the price paid')} />
          <Stat
            label={t('Page opened')}
            value={views.recent}
            note={views.total > views.recent ? t('last 28 days · {n} in all', { n: views.total }) : t('last 28 days')}
          />
          <Stat label={t('Stock left')} value={product.stock} note={product.stock === 0 ? t('nothing to sell') : null} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {sales.lastSoldAt ? t('Last sold {d}. ', { d: onDay(sales.lastSoldAt) }) : ''}
          {t('Cancelled items are not counted. Your own visits and known bots are not counted as page opens; counting began {d}.', { d: onDay(viewsSince) })}
        </p>
      </PanelCard>

      {/* THE SCORE, read-only here. The form is where it gets fixed. */}
      <PanelCard title={t('Listing health')}>
        <div className="flex items-center gap-4">
          <div className="relative size-14 shrink-0">
            <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke={ring} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} />
            </svg>
            <span className={`absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums ${tone}`}>{score}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {fixes.length === 0
              ? t('Nothing left to fix.')
              : t('{n} things would make it easier to find.', { n: fixes.length })}
          </p>
        </div>
        {fixes.length > 0 && (
          <ul className="mt-3 grid gap-1 border-t pt-3 text-sm sm:grid-cols-2">
            {fixes.map((f) => (
              // Each one is a link into the editor with the field as the hash;
              // ProductForm opens that fold and scrolls to it on load.
              <li key={f.key}>
                <Link
                  href={`/seller/products/${productId}#${f.field === 'images' ? 'photos' : f.field}`}
                  className="group flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-accent/60"
                >
                  <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 text-xs font-medium tabular-nums text-brand-ink">+{f.points}</span>
                  <span className="group-hover:underline">{t(f.text)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard title={t('How it looks in Google')}>
        <div className="rounded-lg border bg-background p-3">
          <p className="truncate text-[15px] text-[#1a0dab] dark:text-[#8ab4f8]">
            {product.name}
            {categoryLabel ? ` | ${categoryLabel}` : ''} | ShopMaster Pro
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">www.shopmasterpro.in › products › {product.slug}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {rupees(product.price)} · {String(product.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150)}
          </p>
        </div>
      </PanelCard>

      <PanelCard title={t('Google, right now')}>
        {google ? <GoogleStatus google={google} /> : <Skeleton className="h-32 w-full" />}
      </PanelCard>
    </div>
  );
}
