import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';

import Layout from '../../components/common/Layout';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import ReasonModal from '../../components/common/ReasonModal';
import { getAllOrders, cancelOrderAsAdmin, resolveDispute } from '../../services/adminService';
import { toastSuccess, toastError } from '../../utils/toast';
import { money } from '../../utils/money';

/**
 * Every order on the platform.
 *
 * WHY THIS EXISTS
 *   The admin API could already list and read orders. There was no screen, so
 *   the one role that has to be able to step in - when a seller has gone quiet,
 *   when a customer cannot get through to them - could see nothing and do
 *   nothing. Payouts, sellers and categories all had screens; the orders those
 *   payouts are made against did not.
 */

// Badge already maps a status to its own tone, so it is given the status and
// left to it - a second mapping here would be one more thing to disagree.
const STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const [cancelling, setCancelling] = useState(null); // the order being cancelled
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // The dispute being decided: {order, inFavourOf}.
  const [deciding, setDeciding] = useState(null);
  const [onlyNeedsMe, setOnlyNeedsMe] = useState(false);

  // Declared before the effect that calls it, and memoised, so the effect can
  // depend on it honestly rather than lying with an empty dependency list.
  const load = useCallback(async () => {
    // No setLoading(true) here: it starts true for the first fetch, and a
    // refresh after cancelling should not blank a table the admin is reading -
    // the dialog has its own busy state for that.
    try {
      const { data } = await getAllOrders();
      setOrders(data.orders || []);
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not load the orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitCancel = async () => {
    if (reason.trim().length < 3) {
      toastError('Please say why - the customer is told, and it stays on the order');
      return;
    }
    setBusy(true);
    try {
      await cancelOrderAsAdmin(cancelling._id, reason.trim());
      toastSuccess('Order cancelled and the refund started');
      setCancelling(null);
      setReason('');
      await load();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not cancel that order');
    } finally {
      setBusy(false);
    }
  };

  const visible = orders.filter((o) => {
    if (onlyNeedsMe && !disputeOf(o) && !openReturnOf(o)) return false;
    if (status !== 'all' && o.status !== status) return false;
    if (!query.trim()) return true;
    const hay = `${o.orderNumber || ''} ${o.customerId?.name || ''} ${o.customerId?.email || ''}`;
    return hay.toLowerCase().includes(query.trim().toLowerCase());
  });

  /** Only an order nobody has shipped yet can still be called off. */
  const canCancel = (o) =>
    ['pending', 'processing'].includes(o.status) && !o.shippingAwb;

  /** The parcel somebody is arguing about, if there is one. */
  const disputeOf = (o) =>
    (o.fulfilments || []).find((f) => f.disputeStatus === 'open');

  const openReturnOf = (o) =>
    (o.fulfilments || []).find((f) => ['requested', 'picked'].includes(f.returnStage));

  return (
    <Layout title="Orders">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-2xl font-semibold text-gray-900">Orders</h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Order number, customer, email"
              aria-label="Search orders"
              className="pl-8 pr-3 py-2 text-sm border rounded-lg w-64 max-w-full
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="px-3 py-2 text-sm border rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          {/*
            The whole point of a referee is being able to find the arguments.
            Everything else on this screen is browsing; this is the queue.
          */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlyNeedsMe}
              onChange={(e) => setOnlyNeedsMe(e.target.checked)}
              className="rounded border-gray-300"
            />
            Needs me
          </label>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !visible.length ? (
        <EmptyState
          title={orders.length ? 'Nothing matches that' : 'No orders yet'}
          hint={
            orders.length
              ? 'Try a different search or status.'
              : 'Orders will appear here as customers place them.'
          }
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* A table on desktop, stacked rows on a phone - an admin checking one
              order on the way somewhere should not have to scroll sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o._id} className="border-t border-gray-100">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {o.orderNumber || o._id.slice(-6)}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {new Date(o.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-800">{o.customerId?.name || '—'}</span>
                      <span className="block text-xs text-gray-500 truncate max-w-48">
                        {o.customerId?.email}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{money(o.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700">
                        {o.paymentMethod === 'cod' ? 'COD' : 'Online'}
                      </span>
                      <span
                        className={`block text-xs ${
                          o.paymentStatus === 'refunded'
                            ? 'text-red-600'
                            : o.paymentStatus === 'paid'
                              ? 'text-positive'
                              : 'text-gray-500'
                        }`}
                      >
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge status={o.status}>{o.status}</Badge>
                      {/* Who called it off is worth seeing at a glance: a seller
                          who keeps cancelling is the thing to notice here. */}
                      {o.cancelledBy && (
                        <span className="block text-xs text-gray-500 mt-1">
                          by {o.cancelledBy}
                        </span>
                      )}
                      {/* The thing this screen exists to catch. A disputed
                          order looked exactly like a settled one, so the money
                          sat held and nobody knew to look. */}
                      {disputeOf(o) && (
                        <span className="block text-xs text-red-600 font-medium mt-1">
                          Disputed
                        </span>
                      )}
                      {openReturnOf(o) && (
                        <span className="block text-xs text-gray-600 mt-1">
                          Return {openReturnOf(o).returnStage}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {disputeOf(o) ? (
                        <span className="inline-flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setDeciding({ order: o, inFavourOf: 'seller' })}
                          >
                            For seller
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeciding({ order: o, inFavourOf: 'customer' })}
                          >
                            For customer
                          </Button>
                        </span>
                      ) : canCancel(o) ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setCancelling(o);
                            setReason('');
                          }}
                        >
                          Cancel
                        </Button>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {o.shippingAwb ? 'Shipped' : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(cancelling)}
        title={`Cancel ${cancelling?.orderNumber || 'this order'}?`}
        hint="The customer is refunded in full and told why."
        onClose={() => setCancelling(null)}
      >
        <p className="text-sm text-gray-600">
          {money(cancelling?.totalAmount)} goes back to{' '}
          {cancelling?.paymentMethod === 'cod'
            ? 'nobody — this is a COD order, so no money has been taken'
            : 'the way the customer paid'}
          .
        </p>

        <label htmlFor="reason" className="block text-sm mt-4 mb-1">
          Why are you cancelling?
        </label>
        <textarea
          id="reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Seller unreachable for three days"
          className="w-full border rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        <p className="text-xs text-gray-500 mt-1">
          Kept on the order, so a pattern of cancellations can be seen later.
        </p>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setCancelling(null)}>
            Keep the order
          </Button>
          <Button variant="destructive" onClick={submitCancel} loading={busy} loadingText="Cancelling…">
            Cancel and refund
          </Button>
        </div>
      </Modal>

      {/*
        Deciding an argument.

        A reason is required and kept on the order, because an admin who can
        change a record silently is not a referee - they are a third party with
        a motive nobody can audit. Both sides are shown what was decided.
      */}
      <ReasonModal
        open={Boolean(deciding)}
        title={
          deciding?.inFavourOf === 'customer'
            ? `Decide for the customer on ${deciding?.order?.orderNumber || 'this order'}?`
            : `Decide for the seller on ${deciding?.order?.orderNumber || 'this order'}?`
        }
        hint={
          deciding?.inFavourOf === 'customer'
            ? 'The delivery record is corrected and the customer is refunded in full.'
            : 'The sale stands and the seller is paid as normal.'
        }
        /*
          Asked only when the customer wins, because it is only then that stock
          moves. The record cannot answer it: a dispute about a parcel that
          never arrived and a dispute about a return the seller refused look
          the same here, and they want opposite answers. The referee is the one
          person who knows.

          "No" is first, and therefore the default. Putting stock back that is
          not on the shelf sells an item the shop has not got, and disappoints
          a second customer to tidy up after the first.
        */
        options={
          deciding?.inFavourOf === 'customer'
            ? [
                {
                  value: 'no',
                  label: 'No - the goods are not back',
                  hint: 'The parcel was lost, or the customer still has it. Stock stays as it is.',
                },
                {
                  value: 'yes',
                  label: 'Yes - the seller has the item',
                  hint: 'It was returned and refused, or it came back some other way. Stock goes back up.',
                },
              ]
            : null
        }
        optionsLabel="Has the item come back to the seller?"
        label="What did you decide, and why?"
        placeholder={
          deciding?.inFavourOf === 'customer'
            ? 'Courier could produce no POD and the customer called twice before the scan.'
            : 'Courier POD is signed and the weight matches the manifest.'
        }
        note="Both the customer and the seller are shown this."
        confirmLabel="Record the decision"
        confirmVariant={deciding?.inFavourOf === 'customer' ? 'destructive' : 'primary'}
        minLength={10}
        busy={busy}
        onSubmit={async (resolution, goodsBack) => {
          setBusy(true);
          try {
            const { data } = await resolveDispute(deciding.order._id, {
              inFavourOf: deciding.inFavourOf,
              resolution,
              goodsReturned: goodsBack === 'yes',
            });
            toastSuccess(data.message || 'Decision recorded');
            setDeciding(null);
            await load();
          } catch (err) {
            toastError(err?.response?.data?.message || 'Could not record that');
          } finally {
            setBusy(false);
          }
        }}
        onClose={() => setDeciding(null)}
      />
    </Layout>
  );
}
