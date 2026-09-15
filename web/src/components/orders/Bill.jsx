'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import { money } from '@/lib/money';
import { orderRef } from '@/lib/orderRef';
import { BUSINESS as DEFAULT_BUSINESS } from '@/config/policy';
import { Button } from '@/components/ui/button';

/*
 * The tax split is NOT computed here. backend/utils/invoice.js taxFor works
 * it out once per seller (scheme by place of supply, per-line split, totals)
 * and getOrderDetails sends it as `sellers[id].tax`; this page prints what
 * it is sent, so the customer's copy and the seller's figures are one.
 */
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * The customer's copy of what they bought.
 *
 * WHOSE NAME IS ON IT (15 Sep 2026, plan 2.40)
 *   The seller's. On a marketplace the seller is the supplier: Amazon's and
 *   Flipkart's invoices read "Sold by <legal name>, <address>, GSTIN …" and
 *   name the platform only as the party that generated the document on the
 *   seller's behalf. Until today this page carried the operator's name as
 *   the supplier - right when the site was one shop, wrong now, and it tied
 *   the platform to one of its sellers in print (Rajat: "bill kiske naam
 *   se banta hai, confirm karo"). A split order gets one document per
 *   seller, each with that seller's lines; delivery is the platform's line,
 *   shown once.
 *
 * WHAT IT IS CALLED (checked against the rules, 15 Sep 2026)
 *   A seller without a GSTIN may not issue a TAX invoice (CGST s.122: ₹10,000
 *   or the tax due) - and, it turns out, may not issue a "Bill of Supply"
 *   either: that is a Rule 49 document for REGISTERED composition/exempt
 *   suppliers. What an unregistered seller issues is a plain invoice, or
 *   cash memo, with no tax fields and a line saying so. This page was titled
 *   "Bill of Supply" from the single-shop days; it is now "Invoice" for
 *   everyone, with no tax column, and the footer says whether the seller is
 *   registered. A seller WITH a GSTIN gets a TAX INVOICE (15 Sep 2026,
 *   utils/invoice): their own serial number, HSN per line, taxable value and
 *   CGST+SGST or IGST by place of supply - what CGST Rule 46 asks for. An
 *   unregistered seller's document carries the same serial and no tax column.
 *
 * WHY THERE IS NO PDF LIBRARY
 *   The browser makes better PDFs than a bundled generator, on every platform,
 *   for nothing. This is a page styled for paper - Print gives them a PDF.
 */
export default function Bill({ orderId, business }) {
  const BUSINESS = business || DEFAULT_BUSINESS;
  const { signedIn, user } = useSession();
  const [order, setOrder] = useState(null);
  const [sellers, setSellers] = useState({});
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch(`/customer/orders/${orderId}`);
        if (cancelled) return;
        setOrder(data.order);
        setSellers(data.sellers || {});
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, signedIn]);

  if (!signedIn) {
    return (
      <p className="p-6 text-muted-foreground">
        <Link href={`/login?next=/orders/${orderId}/bill`} className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to see this bill.
      </p>
    );
  }
  if (state.status === 'loading') return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (state.status === 'error') return <p className="p-6 text-destructive">{state.message}</p>;
  if (!order) return null;

  const address = order.shippingAddressId;
  const live = (order.items || []).filter((i) => i.status !== 'cancelled');
  const on = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // One document per seller, in the order their lines appear.
  const groups = [];
  for (const item of live) {
    const key = String(item.sellerId || '');
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, seller: sellers[key] || null, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }
  const multi = groups.length > 1;

  return (
    <div className="print:bg-white print:text-black">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 print:hidden">
        <Link href={`/orders/${orderId}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to the order
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      {groups.map((g, gi) => {
        const s = g.seller;
        const taxed = Boolean(s?.gstin);
        const title = taxed ? 'Tax Invoice' : 'Invoice';
        const invoice = (order.invoices || []).find((x) => String(x.sellerId) === g.key) || null;
        const number = invoice?.number || '';
        // Each line net of its own discount - what the customer actually paid for it.
        const net = (i) => r2(i.price * i.quantity - (i.discountAmount || 0));
        const gross = g.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
        const discount = r2(g.items.reduce((sum, i) => sum + (i.discountAmount || 0), 0));
        const subtotal = r2(gross - discount);
        // The server's tax picture for this seller (null for the unregistered).
        const tax = taxed ? s.tax || null : null;
        const scheme = tax?.scheme || null;
        const totals = tax?.totals || null;
        // A tax invoice is only whole when every line split and the place of supply is known.
        const whole = Boolean(tax && scheme && tax.unsplit === 0);
        const last = gi === groups.length - 1;
        return (
          <div key={g.key || gi} className={`mx-auto mb-10 max-w-3xl rounded-xl border border-border bg-background p-8 print:mb-0 print:rounded-none print:border-0 print:p-0 ${last ? '' : 'print:break-after-page'}`}>
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="text-xs text-muted-foreground">Sold by</p>
                <p className="text-lg font-semibold">{s?.legalName || s?.businessName || 'Seller'}</p>
                {s?.businessName && s.legalName && s.legalName !== s.businessName && <p className="text-xs text-muted-foreground">trading as {s.businessName}</p>}
                <address className="mt-1 text-xs not-italic leading-5 text-muted-foreground">
                  {(s?.address || []).map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                  {s?.gstin ? <>GSTIN <span className="font-mono">{s.gstin}</span></> : s?.enrolled ? <>GST enrolment <span className="font-mono">{s.enrolled}</span></> : 'Not registered under GST'}
                </address>
              </div>
              <div className="text-right">
                <h1 className="text-base font-semibold">{title}</h1>
                {number ? <p className="mt-1 font-mono text-sm">{number}</p> : <p className="mt-1 text-xs text-destructive">Invoice number not issued yet - reload in a moment</p>}
                <p className="mt-1 text-xs text-muted-foreground">Order {orderRef(order)}{multi ? ` · ${gi + 1} of ${groups.length}` : ''}</p>
                {/* The invoice is dated when it was ISSUED (the number's financial year follows that date); the order date is the second line. */}
                <p className="text-xs text-muted-foreground">{invoice?.issuedAt ? `Issued ${on(invoice.issuedAt)} · ordered ${on(order.createdAt)}` : `Ordered ${on(order.createdAt)}`}</p>
                {taxed && <p className="text-xs text-muted-foreground">Place of supply: {scheme ? `${address?.state || ''}${scheme === 'igst' ? ' (inter-state)' : ' (intra-state)'}` : 'could not be determined from the address'}</p>}
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
                <p className="text-sm">{order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid online'}</p>
                {/* "Paid online / Paid" says the same thing twice. Only a status
                    that differs from the method earns a second line. */}
                {order.paymentStatus !== 'paid' && <p className="text-sm capitalize text-muted-foreground">{order.paymentStatus}</p>}
                <p className="mt-2 text-xs text-muted-foreground">Collected through {BUSINESS.tradeName}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="mt-5 w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Item</th>
                    {taxed && <th className="pb-2 font-medium">HSN</th>}
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Price</th>
                    {taxed && <th className="pb-2 text-right font-medium">Taxable</th>}
                    {taxed && <th className="pb-2 text-right font-medium">GST</th>}
                    <th className="pb-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((item) => (
                    <tr key={item._id} className="border-b border-border/60">
                      <td className="py-2.5">
                        {item.name}
                        {item.discountAmount > 0 && <span className="block text-xs text-muted-foreground">less {money(item.discountAmount)} discount</span>}
                      </td>
                      {taxed && <td className="py-2.5 font-mono text-xs">{item.hsn || <span className="font-sans text-destructive">not set</span>}</td>}
                      <td className="py-2.5 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2.5 text-right tabular-nums">{money(item.price)}</td>
                      {taxed && <td className="py-2.5 text-right tabular-nums">{tax?.lines?.[String(item._id)] ? money(tax.lines[String(item._id)].taxable) : '—'}</td>}
                      {taxed && <td className="py-2.5 text-right tabular-nums">{item.gstRate === null || item.gstRate === undefined ? <span className="text-destructive">rate not set</span> : `${item.gstRate}%`}</td>}
                      <td className="py-2.5 text-right tabular-nums">{money(net(item))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="ml-auto mt-4 w-full space-y-1.5 text-sm sm:w-64">
              {taxed && !whole && (
                <p className="text-xs text-destructive">
                  {!scheme ? 'The tax split is not shown: the place of supply could not be determined from the delivery address.' : `The tax split is not shown: ${tax?.unsplit || g.items.length} line(s) have no GST rate set by the seller.`}
                </p>
              )}
              {taxed && whole && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Taxable value</dt>
                    <dd className="tabular-nums">{money(totals.taxable)}</dd>
                  </div>
                  {scheme === 'igst' ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">IGST</dt>
                      <dd className="tabular-nums">{money(totals.igst)}</dd>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">CGST</dt>
                        <dd className="tabular-nums">{money(totals.cgst)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">SGST</dt>
                        <dd className="tabular-nums">{money(totals.sgst)}</dd>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Item total{taxed && whole ? ' (incl. GST)' : ''}</dt>
                <dd className="tabular-nums">{money(subtotal)}</dd>
              </div>
              {last && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery{multi ? ' (whole order)' : ''}</dt>
                  <dd className="tabular-nums">{order.shippingCharges > 0 ? money(order.shippingCharges) : 'Free'}</dd>
                </div>
              )}
              {last && (
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                  <dt>{multi ? 'Order total' : 'Total'}</dt>
                  <dd className="tabular-nums">{money(order.totalAmount)}</dd>
                </div>
              )}
            </dl>

            <footer className="mt-8 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              <p>
                {taxed
                  ? `Tax invoice of ${s?.legalName || 'the seller'}, GSTIN ${s.gstin}. Prices are inclusive of GST${whole ? '; the split above is by place of supply' : ''}. Tax payable on reverse charge: No.`
                  : `${s?.legalName || 'The seller'} is not registered under GST. This is not a tax invoice; no GST has been charged on this sale.`}
              </p>
              <p className="mt-2">
                Issued by {BUSINESS.tradeName}, the marketplace, on behalf of the seller. Delivery is arranged and charged by {BUSINESS.tradeName}. Returns follow the policy at {BUSINESS.tradeName}. Questions: {BUSINESS.email} · {BUSINESS.phone}
              </p>
            </footer>
          </div>
        );
      })}
    </div>
  );
}
