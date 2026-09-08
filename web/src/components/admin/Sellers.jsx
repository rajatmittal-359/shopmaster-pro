'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
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

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

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
            const status = seller.status || (seller.isApproved ? 'approved' : 'pending');

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
                  <p className="text-sm text-muted-foreground">
                    Commission {seller.commissionRate ?? 0}%
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {status !== 'approved' && (
                    <Button
                      disabled={state.status === 'working'}
                      onClick={() => patch(seller._id, '/approve')}
                    >
                      Approve
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
