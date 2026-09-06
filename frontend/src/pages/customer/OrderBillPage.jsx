import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

import { useAuth } from '../../context/authContext';

import { getOrderDetails } from '../../services/orderService';
import { toastError } from '../../utils/toast';
import { money } from '../../utils/money';
import { BUSINESS } from '../../config/policy';
import { orderRef } from '../../utils/orderRef';

/**
 * The customer's copy of what they bought.
 *
 * WHY IT IS A "BILL OF SUPPLY" AND NOT AN INVOICE
 *   Marketplaces call this an Invoice, and Shiprocket prints one titled TAX
 *   INVOICE with an empty GSTIN field. An unregistered supplier may not issue a
 *   tax invoice - the correct document is a Bill of Supply, and CGST s.122 puts
 *   the penalty for getting that wrong at ₹10,000 or 100% of tax due.
 *
 *   So this is titled honestly, carries no tax columns it cannot fill, and says
 *   plainly that the shop is not registered. The day a GSTIN exists, this
 *   becomes a tax invoice and the tax lines appear - the shape is already
 *   right for it.
 *
 * WHY THERE IS NO PDF LIBRARY
 *   The browser makes better PDFs than a bundled generator, on every platform,
 *   for nothing. This is a page styled for paper; Print gives them a PDF.
 */
export default function OrderBillPage() {
  const { orderId } = useParams();
  // A bill needs a name on it. The customer viewing their own order IS the
  // buyer, so this needs no extra field on the order.
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await getOrderDetails(orderId);
      setOrder(data.order);
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not load that order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="p-10 text-sm text-gray-500">Loading…</div>;
  }
  if (!order) {
    return <div className="p-10 text-sm text-gray-700">We could not find that order.</div>;
  }

  const address = order.shippingAddressId;
  const itemsTotal = Math.max(0, (order.totalAmount || 0) - (order.shippingCharges || 0));
  const live = order.items.filter((i) => i.status !== 'cancelled');

  const on = (d) =>
    new Date(d).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Everything in here is for the screen only; paper gets the document. */}
      <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between print:hidden">
        <Link to={`/customer/orders/${orderId}`} className="text-sm text-brand-ink font-medium">
          ← Back to the order
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-brand-fill hover:bg-brand-fill-hover text-on-brand text-sm
                     font-semibold px-4 py-2 rounded-lg"
        >
          Print or save as PDF
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl
                      p-8 mb-10 print:border-0 print:rounded-none print:p-0 print:mb-0">
        <header className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-gray-200">
          <div>
            <p className="text-lg font-semibold text-gray-900">{BUSINESS.legalName}</p>
            <address className="not-italic text-xs text-gray-600 mt-1 leading-5">
              {BUSINESS.addressLines.map((l) => (
                <span key={l}>
                  {l}
                  <br />
                </span>
              ))}
              {BUSINESS.phone}
            </address>
          </div>
          <div className="text-right">
            <h1 className="text-base font-semibold text-gray-900">Bill of Supply</h1>
            <p className="text-xs text-gray-600 mt-1">{orderRef(order)}</p>
            <p className="text-xs text-gray-600">{on(order.createdAt)}</p>
          </div>
        </header>

        <div className="grid sm:grid-cols-2 gap-6 py-5 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-500 mb-1">Billed to</p>
            {address ? (
              <address className="not-italic text-sm text-gray-800 leading-6">
                {user?.name && (
                  <>
                    {user.name}
                    <br />
                  </>
                )}
                {address.street}
                <br />
                {address.city}, {address.state} {address.zipCode}
                <br />
                {address.phoneNumber}
              </address>
            ) : (
              <p className="text-sm text-gray-500">—</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-gray-500 mb-1">Payment</p>
            <p className="text-sm text-gray-800">
              {order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}
            </p>
            {/* "Paid online / Paid" said the same thing twice. Only a status
                that differs from the method is worth a second line. */}
            {order.paymentStatus !== 'paid' && (
              <p className="text-sm text-gray-600 capitalize">{order.paymentStatus}</p>
            )}
          </div>
        </div>

        <table className="w-full text-sm mt-5">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 font-medium text-right">Qty</th>
              <th className="pb-2 font-medium text-right">Price</th>
              <th className="pb-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {live.map((item) => (
              <tr key={item._id} className="border-b border-gray-100">
                <td className="py-2.5 text-gray-800">{item.name}</td>
                <td className="py-2.5 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2.5 text-right tabular-nums">{money(item.price)}</td>
                <td className="py-2.5 text-right tabular-nums">
                  {money(item.price * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto w-full sm:w-64 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Item total</dt>
            <dd className="tabular-nums">{money(itemsTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Delivery</dt>
            <dd className="tabular-nums">
              {order.shippingCharges > 0 ? money(order.shippingCharges) : 'Free'}
            </dd>
          </div>
          <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2 mt-2">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(order.totalAmount)}</dd>
          </div>
        </dl>

        <footer className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500 leading-5">
          <p>
            {BUSINESS.legalName} is not registered under GST. This is a Bill of
            Supply, not a tax invoice, and no tax has been charged on this sale.
          </p>
          <p className="mt-2">
            Returns follow the policy at {BUSINESS.tradeName}. Questions:{' '}
            {BUSINESS.email} · {BUSINESS.phone}
          </p>
        </footer>
      </div>
    </div>
  );
}
