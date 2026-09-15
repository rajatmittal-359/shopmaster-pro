'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ActionDialog from '@/components/common/ActionDialog';

/**
 * Who may sell here, and on what terms.
 *
 * WHY COMMISSION IS EDITED HERE AND NOWHERE ELSE
 *   The rate is SNAPSHOTTED onto every order line when the order is placed, so
 *   changing it never rewrites history - it only changes what happens next.
 *   That is worth saying on the screen, because the natural fear when typing a
 *   new number is that it silently re-prices last month.
 *
 * WHY SUSPENDING IS NOT DELETING
 *   A suspended seller's products come out of the shop and their account stays.
 *   Orders already placed still have to be delivered, returned and paid out;
 *   deleting the seller would orphan all of it.
 */
function Fact({ ok, warn, children }) {
  const tone = ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : warn ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'border-border text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${tone}`}>
      <span aria-hidden>{ok ? '✓' : warn ? '!' : '–'}</span>
      {children}
    </span>
  );
}

/** What to know before Approve - the seller-application brief (plan 2.19). */
function ApplicationFacts({ a }) {
  const age = a.accountAgeDays;
  return (
    <div className="mt-3 rounded-lg border bg-muted/40 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Before you approve</p>
      <div className="flex flex-wrap gap-1.5">
        <Fact ok={a.emailVerified} warn={!a.emailVerified}>{a.emailVerified ? 'Email verified' : 'Email not verified'}</Fact>
        <Fact ok={age !== null && age >= 7} warn={age !== null && age < 1}>
          {age === null ? 'Account age unknown' : age < 1 ? 'Account made today' : `Account ${age} day${age === 1 ? '' : 's'} old`}
        </Fact>
        <Fact ok={Boolean(a.pickup)} warn={!a.pickup}>{a.pickup ? `Pickup: ${a.pickup}${a.inJaipur ? ' · Jaipur' : ''}` : 'No pickup address yet'}</Fact>
        <Fact ok={a.bank}>{a.bank ? 'Bank account added' : 'No bank account yet'}</Fact>
        <Fact ok={a.gst}>{a.gst ? 'GST number given' : 'No GST (fine under the threshold)'}</Fact>
        <Fact ok={a.aboutWords >= 15}>{a.aboutWords ? `About: ${a.aboutWords} words` : 'No shop story yet'}</Fact>
        <Fact ok={a.links > 0}>{a.links ? `${a.links} profile link${a.links === 1 ? '' : 's'}` : 'No Instagram / Google profile'}</Fact>
        {a.buyer && (
          <Fact ok={a.buyer.orders > 0 && a.buyer.level === 'clean'} warn={a.buyer.level !== 'clean'}>
            {a.buyer.orders ? `Bought here ${a.buyer.orders}× · ${a.buyer.level === 'clean' ? 'clean record' : a.buyer.signals.join(', ')}` : 'Never bought here'}
          </Fact>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Address, bank and story can be filled after approval - they are on the seller&rsquo;s first-day list. A dash is not a reason to refuse; an unverified email or a risk flag is a reason to ask first.</p>
    </div>
  );
}

const STATUS_NOTE = {
  pending: 'Waiting for you to decide',
  approved: 'Selling',
  rejected: 'Turned down',
  suspended: 'Hidden from the shop',
};

export default function Sellers() {
  const [sellers, setSellers] = useState([]);
  const [state, setState] = useState({ status: 'loading' });
  const [rate, setRate] = useState({});
  // { kind: 'reject' | 'suspend', seller }
  const [asking, setAsking] = useState(null);

  const load = async () => {
    const data = await authedFetch('/admin/sellers/pending');
    setSellers(data.sellers || []);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/admin/sellers/pending');
        if (cancelled) return;
        setSellers(data.sellers || []);
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

  const patch = (id, path, body) =>
    run(() => authedFetch(`/admin/sellers/${id}${path}`, { method: 'PATCH', body }));

  if (state.status === 'loading') {
    return (
      <div className="skeleton-in space-y-4" aria-busy="true" aria-label="Loading sellers">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      {sellers.length === 0 ? (
        <p className="text-muted-foreground">Nobody has applied to sell yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
          {sellers.map((seller) => {
            // Seller.status only knows active/suspended (its default is
            // 'active' before anyone approved anything), so the row's state
            // is derived from the three flags together. Reading status alone
            // showed "active" and an Approve button on every shop.
            const status = seller.status === 'suspended' ? 'suspended' : seller.kycStatus === 'rejected' ? 'rejected' : seller.isApproved ? 'approved' : 'pending';

            return (
              <li key={seller._id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium">{seller.businessName || seller.shopName}</p>
                    <p className="text-sm text-muted-foreground">
                      {seller.userId?.email || seller.email || ''} · {STATUS_NOTE[status] || status}
                      {seller.kycStatus ? ` · KYC ${seller.kycStatus}` : ''}
                    </p>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>Commission {seller.commissionRate ?? 0}%</p>
                    {/* The rulebook's two facts about a shop: did they accept it,
                        and how often do they cancel what they accepted. */}
                    <p>
                      {seller.agreementUpToDate ? (
                        <span>Agreement v{seller.agreement?.version} ✓</span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">Agreement not accepted</span>
                      )}
                    </p>
                    {seller.cancellations && (
                      <p className={seller.cancellations.ratePct > seller.cancellations.reviewAbovePct ? 'text-destructive' : ''}>
                        Cancelled by seller: {seller.cancellations.cancelledBySeller} of {seller.cancellations.orders} in 30 days
                        {seller.cancellations.orders ? ` (${seller.cancellations.ratePct}%)` : ''}
                        {seller.cancellations.ratePct > seller.cancellations.reviewAbovePct ? ' · above the review line' : ''}
                      </p>
                    )}
                  </div>
                </div>

                {/* Before you approve (plan 2.19): the facts an application
                    does not say about itself, as ticks and dashes. No model -
                    there is nothing to weigh, only things to know. */}
                {status === 'pending' && seller.application && <ApplicationFacts a={seller.application} />}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(status === 'pending' || status === 'rejected') && (
                    <Button
                      disabled={state.status === 'working'}
                      onClick={() => patch(seller._id, '/approve')}
                    >
                      {status === 'rejected' ? 'Approve after all' : 'Approve'}
                    </Button>
                  )}

                  {status === 'pending' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAsking({ kind: 'reject', seller })}
                    >
                      Turn down
                    </Button>
                  )}

                  {status === 'approved' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAsking({ kind: 'suspend', seller })}
                    >
                      Suspend
                    </Button>
                  )}

                  {status === 'suspended' && (
                    <Button variant="outline" size="sm" onClick={() => patch(seller._id, '/activate')}>
                      Let them sell again
                    </Button>
                  )}

                  <span className="ml-auto flex items-center gap-2">
                    <Input
                      value={rate[seller._id] ?? seller.commissionRate ?? 0}
                      onChange={(e) =>
                        setRate({ ...rate, [seller._id]: e.target.value.replace(/[^\d.]/g, '') })
                      }
                      aria-label={`Commission for ${seller.businessName}`}
                      className="w-20"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        rate[seller._id] === undefined ||
                        Number(rate[seller._id]) === Number(seller.commissionRate)
                      }
                      onClick={() =>
                        patch(seller._id, '/commission', {
                          commissionRate: Number(rate[seller._id]),
                        })
                      }
                    >
                      Set %
                    </Button>
                  </span>
                </div>

                {/* Said next to the field, because the fear when typing a new
                    rate is that it re-prices what has already been sold. */}
                <p className="mt-2 text-xs text-muted-foreground">
                  A new rate applies to future orders only - the rate is copied onto
                  each order line when the order is placed.
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Two different decisions, one dialog. Turning an application down ends
        it; suspending stops a shop that is already trading, and the difference
        matters enough to say in the description rather than in a tooltip.
      */}
      <ActionDialog
        open={Boolean(asking)}
        onOpenChange={(next) => setAsking(next ? asking : null)}
        title={
          asking?.kind === 'suspend'
            ? `Suspend ${asking?.seller?.businessName || 'this shop'}`
            : `Turn down ${asking?.seller?.businessName || 'this application'}`
        }
        description={
          asking?.kind === 'suspend'
            ? 'Their products come out of the shop straight away. Orders already placed still have to be delivered, returned and paid out.'
            : 'They are told, and they can apply again once whatever is wrong is fixed.'
        }
        reasons={
          asking?.kind === 'suspend'
            ? [
                'Not dispatching orders',
                'Repeated cancellations',
                'Complaints about quality',
                'Suspected fraud',
              ]
            : [
                'We could not verify the business',
                'They sell something we do not carry',
                'The same shop has applied already',
              ]
        }
        requireReason
        destructive
        confirmLabel={asking?.kind === 'suspend' ? 'Suspend this shop' : 'Turn it down'}
        busy={state.status === 'working'}
        note="The seller sees this."
        onConfirm={(reason) => {
          const { kind, seller } = asking;
          setAsking(null);
          patch(seller._id, kind === 'suspend' ? '/suspend' : '/reject', { reason });
        }}
      />
    </div>
  );
}
