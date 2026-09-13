'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Returns & issues - the three queues that are not "orders".
 *
 * Meesho's supplier panel and Flipkart Seller Hub both keep Returns apart
 * from Orders, and Amazon has a separate Manage Returns and A-to-z page,
 * because each of these needs a different action from the seller: a return
 * needs receiving and settling, a dispute needs evidence within 72 hours, a
 * failed delivery needs a phone call or a re-attempt. Mixed into the order
 * list they were three kinds of urgent hiding behind one status word.
 *
 * Each row opens the order, where the actions already live.
 */
const TABS = [
  { key: 'returns', label: 'Returns & exchanges' },
  { key: 'disputes', label: 'Disputes' },
  { key: 'delivery', label: 'Delivery problems' },
];

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const hoursLeft = (iso, hours) => Math.max(0, Math.round((new Date(iso).getTime() + hours * 3600000 - Date.now()) / 3600000));

const RETURN_WORDS = {
  requested: ['Return requested', 'The pickup is being booked. Nothing to do yet.'],
  picked: ['On its way back', 'Check it when it arrives, then settle from the order.'],
  received: ['Received - settle it', 'Refund or send the replacement from the order page.'],
};

function Row({ r, headline, sub, tone = '' }) {
  return (
    <li>
      <Link href={`/seller/orders/${r._id}`} className="flex items-start gap-3 rounded-lg px-2 py-3 transition hover:bg-accent/60">
        <span className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
          {r.items[0]?.image && <Image src={r.items[0].image} alt="" fill unoptimized className="object-cover" sizes="48px" />}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">{r.orderNumber}</span>
            <span className="text-xs text-muted-foreground">{r.customer}</span>
          </span>
          <span className="block truncate text-muted-foreground">{r.items.map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ')}</span>
          <span className={`mt-1 block font-medium ${tone}`}>{headline}</span>
          {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
        </span>
      </Link>
    </li>
  );
}

export default function Issues() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'returns';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/issues')
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
      <div className="skeleton-in space-y-3" aria-busy="true">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const list = data[tab] || [];

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => router.replace(`/seller/issues?tab=${t.key}`)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${tab === t.key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
            {data.counts[t.key] > 0 && (
              <span className="rounded-full bg-brand-ink px-1.5 text-[0.65rem] leading-4 font-semibold text-white tabular-nums">{data.counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      <PanelCard
        title={TABS.find((t) => t.key === tab).label}
        lead={
          tab === 'returns'
            ? 'Requests, pickups on the way back, and items received that need settling. The rider brings the label; the customer prints nothing.'
            : tab === 'disputes'
              ? 'A customer says something is wrong. You have 72 hours to add your side - photos, the courier proof - before an admin decides.'
              : 'Parcels the courier could not deliver or never collected. A call to the customer solves most of them.'
        }
      >
        {list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {tab === 'returns' ? 'No returns or exchanges open.' : tab === 'disputes' ? 'No disputes. Keep it that way with clear photos and honest titles.' : 'Every parcel is moving.'}
          </p>
        ) : (
          <ul className="divide-y">
            {list.map((r) => {
              if (tab === 'returns') {
                const [head, sub] = RETURN_WORDS[r.returnStage] || [r.returnStage, ''];
                const what = r.returnResolution === 'replacement' ? 'Exchange' : 'Return';
                const rep = r.replacementStage ? ` · replacement ${r.replacementStage}` : '';
                return <Row key={r._id} r={r} headline={`${what}: ${head}${rep}`} sub={`${r.returnReason || ''}${r.returnRequestedAt ? ` · asked ${when(r.returnRequestedAt)}` : ''}${sub ? ` · ${sub}` : ''}`} tone={r.returnStage === 'received' ? 'text-amber-700 dark:text-amber-300' : ''} />;
              }
              if (tab === 'disputes') {
                const open = r.disputeStatus === 'open';
                const left = open && r.disputeRaisedAt ? hoursLeft(r.disputeRaisedAt, 72) : null;
                const head = open ? (left > 0 ? `Open - ${left} h left to answer` : 'Open - answer overdue') : r.disputeStatus === 'resolved_customer' ? 'Decided for the customer' : 'Decided for you';
                return <Row key={r._id} r={r} headline={head} sub={`“${r.disputeReason || ''}” · raised ${when(r.disputeRaisedAt)}`} tone={open ? 'text-destructive' : ''} />;
              }
              const head = r.nprReason ? 'Courier did not collect' : `Delivery failed ${r.ndrAttempts} time${r.ndrAttempts === 1 ? '' : 's'}`;
              const sub = r.nprReason || `${r.ndrReason || ''}${r.ndrAt ? ` · last try ${when(r.ndrAt)}` : ''} · call the customer, then ask the courier to re-attempt`;
              return <Row key={r._id} r={r} headline={head} sub={sub} tone="text-amber-700 dark:text-amber-300" />;
            })}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}
