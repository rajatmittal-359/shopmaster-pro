'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Performance - Amazon's Account Health and Meesho's Quality page, for us.
 *
 * Seven numbers from the last 30 days, each beside the line the Seller
 * Agreement draws, each coloured by which side of the line it sits. The
 * seller sees trouble before the admin writes, and sees exactly which number
 * to move. Nothing here is a guess: the server computes it from the same
 * orders and products the rest of the panel shows (utils/performance.js).
 */
const TONE = {
  good: 'text-emerald-700 dark:text-emerald-300',
  watch: 'text-amber-700 dark:text-amber-300',
  review: 'text-destructive',
  none: 'text-muted-foreground',
};
const WORD = { good: 'Good', watch: 'Watch', review: 'Needs work', none: 'No data yet' };

const METRICS = [
  { key: 'cancelRate', title: 'Cancelled by you', fmt: (m) => (m.value == null ? '—' : `${m.value}%`), line: (m) => ['Account review above {n}%. 2 free a month, then ₹50 each.', { n: m.threshold }], fix: 'Keep stock honest - an out-of-stock cancel is the commonest one.', href: '/seller/products' },
  { key: 'dispatchHours', title: 'Time to dispatch', fmt: (m) => (m.value == null ? '—' : m.value < 48 ? `${m.value} h` : `${Math.round(m.value / 24)} days`), line: (m) => ['Rulebook: within {days} working days. Median of {n} shipped.', { days: m.threshold / 24, n: m.shipped }], fix: 'Pack the same day; the courier is one button on the order.', href: '/seller/orders' },
  { key: 'lateDispatch', title: 'Shipped late', fmt: (m) => (m.value == null ? '—' : `${m.value}%`), line: () => ['Share of parcels shipped after the window.'], fix: 'Late parcels become "where is my order" messages and cancels.', href: '/seller/orders' },
  { key: 'ndr', title: 'Failed deliveries', fmt: (m) => (m.value == null ? '—' : String(m.value)), line: () => ['Parcels the courier could not hand over.'], fix: 'Confirm the address and phone on COD orders before packing.', href: '/seller/issues?tab=delivery' },
  { key: 'rto', title: 'Returned to you undelivered', fmt: (m) => (m.value == null ? '—' : String(m.value)), line: () => ['RTO - you pay the return leg on these.'], fix: 'Call once after the first failed attempt; most RTOs die there.', href: '/seller/issues?tab=delivery' },
  { key: 'rating', title: 'Rating', fmt: (m) => (m.value == null ? '—' : `${m.value} ★`), line: (m) => (m.count ? ['{n} verified reviews.', { n: m.count }] : ['No reviews yet.']), fix: 'Photos that match the piece, and a note in the parcel asking for a review.', href: '/seller/products' },
  { key: 'listingQuality', title: 'Listing quality', fmt: (m) => (m.value == null ? '—' : `${m.value}/100`), line: (m) => ['Average across {n} live products. Google and shoppers read the same things.', { n: m.products }], fix: 'Open a product - the score at the top says which three things to fix.', href: '/seller/products' },
];

export default function Performance() {
  const t = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/performance')
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="skeleton-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const worst = METRICS.map((m) => data[m.key]?.status).includes('review') ? 'review' : METRICS.map((m) => data[m.key]?.status).includes('watch') ? 'watch' : 'good';

  return (
    <div className="space-y-6">
      <div className={`rounded-xl border p-4 text-sm ${worst === 'review' ? 'border-destructive/40 bg-destructive/5' : worst === 'watch' ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30'}`}>
        <p className="font-medium">
          {t(worst === 'review' ? 'Something here crosses a rulebook line.' : worst === 'watch' ? 'Healthy, with a number or two to watch.' : 'Healthy. Nothing here needs you.')}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {t('Last {days} days, {orders} orders. These are the numbers in the', { days: data.days, orders: data.orders })}{' '}
          <Link href="/seller/help" className="text-brand-ink hover:underline">
            {t('Seller Agreement')}
          </Link>
          {t('; a marketplace that keeps them is one buyers come back to.')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {METRICS.map((m) => {
          const v = data[m.key] || { status: 'none' };
          return (
            <PanelCard key={m.key} className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-muted-foreground">{t(m.title)}</p>
                <span className={`text-xs font-medium ${TONE[v.status]}`}>{WORD[v.status]}</span>
              </div>
              <p className={`mt-1 text-3xl font-semibold tabular-nums ${TONE[v.status]}`}>{m.fmt(v)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t(...m.line(v))}</p>
              {v.status !== 'good' && v.status !== 'none' && (
                <p className="mt-3 text-xs">
                  {t(m.fix)}{' '}
                  <Link href={m.href} className="font-medium text-brand-ink hover:underline">
                    Go →
                  </Link>
                </p>
              )}
            </PanelCard>
          );
        })}
      </div>
    </div>
  );
}
