'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import PanelCard from '@/components/panel/PanelCard';

/**
 * The Trust queue (plan 2.22): everything the moderator or the rulebook held
 * for a person, each with its reason and its button. Six lists, most urgent
 * first; an empty list says so and takes no room.
 *
 * Reference: Etsy's case queue and Shopify's fraud card - item, why, button.
 * Built for the Saturday-morning admin: nothing here needs a second page.
 */
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const Cats = ({ list }) => (list?.length ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{list.join(' · ')}</span> : null);

export default function TrustQueue() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => authedFetch('/admin/trust').then(setData).catch((e) => toast.error(e.message));
  useEffect(() => {
    let cancelled = false;
    authedFetch('/admin/trust')
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const act = async (key, path, body, doneText) => {
    setBusy(key);
    try {
      await authedFetch(path, { method: body?.approve !== undefined ? 'POST' : 'PATCH', body });
      toast.success(doneText);
      await load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  if (!data) return <p className="text-sm text-muted-foreground">Reading what is waiting…</p>;
  const total = data.heldReviews.length + data.heldAbouts.length + data.heldReturns.length + data.flaggedDisputes.length;

  return (
    <div className="space-y-6">
      {total === 0 && <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Nothing is held right now. Restricted customers and sellers to watch are below.</p>}

      {data.heldReturns.length > 0 && (
        <PanelCard title={`Returns waiting for you (${data.heldReturns.length})`} lead="Big amounts, or customers whose returns need a yes. Approve books the pickup; refuse writes the reason on the order.">
          <ul className="divide-y text-sm">
            {data.heldReturns.map((r) => (
              <li key={`${r.orderId}-${r.sellerId}`} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.orderNumber} · {money(r.amount)} · {r.customer?.name}</p>
                  <p className="text-muted-foreground">{String(r.kind || '').replace(/_/g, ' ')} · “{r.reason}” · {when(r.requestedAt)}{r.tagIntact ? ' · tag confirmed' : ''}{r.evidence.length ? ` · ${r.evidence.length} photo(s)` : ''}</p>
                </div>
                <Button size="sm" disabled={busy === r.orderId} onClick={() => act(r.orderId, `/admin/orders/${r.orderId}/return/approve`, { sellerId: r.sellerId, approve: true }, 'Approved')}>Approve</Button>
                <Button size="sm" variant="outline" disabled={busy === r.orderId} onClick={() => { const note = window.prompt('Why is this return refused? The customer reads this.'); if (note && note.trim().length > 4) act(r.orderId, `/admin/orders/${r.orderId}/return/approve`, { sellerId: r.sellerId, approve: false, note }, 'Refused'); }}>Refuse</Button>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {data.heldReviews.length > 0 && (
        <PanelCard title={`Reviews held (${data.heldReviews.length})`} lead="The rating counted; the words wait. Approve shows them; remove keeps the record and drops the words.">
          <ul className="divide-y text-sm">
            {data.heldReviews.map((r) => (
              <li key={r._id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.customer?.name}</span>
                  <span className="text-muted-foreground">on</span>
                  <Link href={`/products/${r.product?.slug || r.product?._id}`} className="text-brand-ink hover:underline">{r.product?.name}</Link>
                  <span className="text-muted-foreground">· {r.rating}★ · {when(r.createdAt)}</span>
                  <Cats list={r.moderation?.categories} />
                </div>
                <p className="mt-1 rounded-md bg-muted/50 p-2">{r.title ? <strong>{r.title} - </strong> : null}{r.comment}</p>
                <p className="mt-1 text-xs text-muted-foreground">{r.moderation?.reason} ({r.moderation?.by})</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busy === r._id} onClick={() => act(r._id, `/admin/trust/reviews/${r._id}`, { action: 'approve' }, 'Review shown')}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={busy === r._id} onClick={() => act(r._id, `/admin/trust/reviews/${r._id}`, { action: 'remove' }, 'Words removed, rating kept')}>Remove the words</Button>
                </div>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {data.heldAbouts.length > 0 && (
        <PanelCard title={`Seller Abouts held (${data.heldAbouts.length})`} lead="A shop's About with a phone number or a link - shoppers reach sellers through ShopMaster.">
          <ul className="divide-y text-sm">
            {data.heldAbouts.map((s) => (
              <li key={s.sellerUserId} className="py-3">
                <p className="font-medium">{s.businessName} <Cats list={s.moderation?.categories} /></p>
                <p className="mt-1 rounded-md bg-muted/50 p-2">{s.about}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.moderation?.reason}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={busy === s.sellerUserId} onClick={() => act(s.sellerUserId, `/admin/trust/sellers/${s.sellerUserId}/about`, { action: 'approve' }, 'About shown')}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={busy === s.sellerUserId} onClick={() => act(s.sellerUserId, `/admin/trust/sellers/${s.sellerUserId}/about`, { action: 'remove' }, 'About removed')}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      {data.flaggedDisputes.length > 0 && (
        <PanelCard title={`Disputes with flagged words (${data.flaggedDisputes.length})`} lead="Not blocked - an angry customer is still a customer - but read these with the flag in mind. Decide them on Orders.">
          <ul className="divide-y text-sm">
            {data.flaggedDisputes.map((d) => (
              <li key={`${d.orderId}-${d.sellerId}`} className="py-3">
                <p><Link href="/admin/orders" className="font-medium text-brand-ink hover:underline">{d.orderNumber}</Link> · {d.customer?.name} · {when(d.raisedAt)} <Cats list={d.flags} /></p>
                <p className="mt-1 text-muted-foreground">“{d.reason}”</p>
              </li>
            ))}
          </ul>
        </PanelCard>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <PanelCard title={`Restricted customers (${data.restricted.length})`} lead="What you set, with the reason they see. Change it from Customers → Record.">
          {data.restricted.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <ul className="divide-y text-sm">
              {data.restricted.map((u) => (
                <li key={u._id} className="py-2">
                  <p className="font-medium">{u.name} <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-semibold">{String(u.risk?.level || '').replace(/_/g, ' ')}</span></p>
                  <p className="text-xs text-muted-foreground">{u.risk?.reason} · {when(u.risk?.setAt)}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs"><Link href="/admin/customers" className="text-brand-ink hover:underline">Customers →</Link></p>
        </PanelCard>
        <PanelCard title={`Sellers to watch (${data.watch.length})`} lead="180-day record: lost disputes, not-as-described returns, overturned refusals, missing pack proof.">
          {data.watch.length === 0 ? <p className="text-sm text-muted-foreground">Every active seller is clean.</p> : (
            <ul className="divide-y text-sm">
              {data.watch.map((s) => (
                <li key={s.sellerId} className="py-2">
                  <p className="font-medium">{s.businessName} <span className={`ml-1 rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${s.level === 'high' ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 text-amber-800'}`}>{s.level}</span></p>
                  <p className="text-xs text-muted-foreground">{s.signals.join(' · ')}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs"><Link href="/admin/sellers" className="text-brand-ink hover:underline">Sellers →</Link></p>
        </PanelCard>
      </div>
    </div>
  );
}
