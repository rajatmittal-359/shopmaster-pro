'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { money } from '@/lib/money';
import { orderRef } from '@/lib/orderRef';
import { BUSINESS } from '@/config/policy';
import { Button } from '@/components/ui/button';

/**
 * The customer's copy of what they bought.
 *
 * WHY IT IS A "BILL OF SUPPLY" AND NOT AN INVOICE
 *   Marketplaces call this an Invoice, and Shiprocket prints one titled TAX
 *   INVOICE with an empty GSTIN field. An unregistered supplier may not issue a
 *   tax invoice - the correct document is a Bill of Supply, and CGST s.122 puts
 *   the penalty for getting that wrong at ₹10,000 or 100% of the tax due.
 *
 *   So this is titled honestly, carries no tax column it cannot fill, and says
 *   plainly that the shop is not registered. The day a GSTIN exists this becomes
 *   a tax invoice and the tax lines appear; the shape is already right for it.
 *
 * WHY THERE IS NO PDF LIBRARY
 *   The browser makes better PDFs than a bundled generator, on every platform,
 *   for nothing. This is a page styled for paper - Print gives them a PDF.
 */
export default function Bill({ orderId }) {
  const { signedIn, user } = useSession();
  const [order, setOrder] = useState(null);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const data = await authedFetch(`/customer/orders/${orderId}`);
        if (cancelled) return;
        setOrder(data.order);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, orderId]);

  if (!signedIn) {
    return (
      <p className="p-10 text-sm text-muted-foreground">
        <Link
          href={`/login?next=${encodeURIComponent(`/orders/${orderId}/bill`)}`}
          className="text-brand-ink underline"
        >
          Sign in
        </Link>{' '}
        to see this bill.
      </p>
    );
  }

  if (state.status === 'loading') {
    return <p className="p-10 text-sm text-muted-foreground">Loading…</p>;
  }
  if (!order) {
    return <p className="p-10 text-sm text-destructive">{state.message || 'Not found'}</p>;
  }

  const address = order.shippingAddressId;
  const itemsTotal = Math.max(0, (order.totalAmount || 0) - (order.shippingCharges || 0));
  const live = (order.items || []).filter((i) => i.status !== 'cancelled');

  const on = (d) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="bg-muted/30 print:bg-white">
      {/* Screen only. Paper gets the document and nothing else. */}
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 print:hidden">
        <Link href={`/orders/${orderId}`} className="text-sm font-medium text-brand-ink">
          Back to the order
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <div className="mx-auto mb-10 max-w-3xl rounded-xl border border-border bg-background p-8 print:mb-0 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <p className="text-lg font-semibold">{BUSINESS.legalName}</p>
            <address className="mt-1 text-xs not-italic leading-5 text-muted-foreground">
              {BUSINESS.addressLines.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
              {BUSINESS.phone}
            </address>
          </div>
          <div className="text-right">
            <h1 className="text-base font-semibold">Bill of Supply</h1>
            <p className="mt-1 text-xs text-muted-foreground">{orderRef(order)}</p>
            <p className="text-xs text-muted-foreground">{on(order.createdAt)}</p>
          </div>
        </header>

        <div className="grid gap-6 border-b border-border py-5 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Billed to</p>
            {address ? (
              <address className="text-sm not-italic leading-6">
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
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <div className="sm:text-right">
            <p className="mb-1 text-xs text-muted-foreground">Payment</p>
            <p className="text-sm">
              {order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}
            </p>
            {/* "Paid online / Paid" says the same thing twice. Only a status
                that differs from the method earns a second line. */}
            {order.paymentStatus !== 'paid' && (
              <p className="text-sm capitalize text-muted-foreground">{order.paymentStatus}</p>
            )}
          </div>
        </div>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 text-right font-medium">Qty</th>
              <th className="pb-2 text-right font-medium">Price</th>
              <th className="pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {live.map((item) => (
              <tr key={item._id} className="border-b border-border/60">
                <td className="py-2.5">{item.name}</td>
                <td className="py-2.5 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2.5 text-right tabular-nums">{money(item.price)}</td>
                <td className="py-2.5 text-right tabular-nums">
                  {money(item.price * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 w-full space-y-1.5 text-sm sm:w-64">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Item total</dt>
            <dd className="tabular-nums">{money(itemsTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery</dt>
            <dd className="tabular-nums">
              {order.shippingCharges > 0 ? money(order.shippingCharges) : 'Free'}
            </dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{money(order.totalAmount)}</dd>
          </div>
        </dl>

        <footer className="mt-8 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
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
