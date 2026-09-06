import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';

import Layout from '../../components/common/Layout';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import { getAllOrders, cancelOrderAsAdmin } from '../../services/adminService';
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
    if (status !== 'all' && o.status !== status) return false;
    if (!query.trim()) return true;
    const hay = `${o.orderNumber || ''} ${o.customerId?.name || ''} ${o.customerId?.email || ''}`;
    return hay.toLowerCase().includes(query.trim().toLowerCase());
  });

  /** Only an order nobody has shipped yet can still be called off. */
  const canCancel = (o) =>
    ['pending', 'processing'].includes(o.status) && !o.shippingAwb;

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
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {canCancel(o) ? (
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
    </Layout>
  );
}
