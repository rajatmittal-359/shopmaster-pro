'use client';

/**
 * One month's commission bill, printable (plan 2.85). The figures, numbers and
 * both parties' names are what was stored when it was issued - this page only
 * draws them. Not a tax invoice: the platform has no GSTIN, and says so.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const monthName = (m) => new Date(`${m}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function CommissionBill({ month }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let live = true;
    authedFetch(`/seller/commission-invoices/${encodeURIComponent(month)}`)
      .then((r) => live && setState({ status: 'ok', invoice: r.invoice }))
      .catch((err) => live && setState({ status: 'error', message: err.message }));
    return () => {
      live = false;
    };
  }, [month]);

  if (state.status === 'loading') return <p className="p-6 text-sm text-muted-foreground">Preparing the bill…</p>;
  if (state.status === 'error') {
    return (
      <div className="p-6 text-sm">
        <p>{state.message}</p>
        <Link href="/seller/payments" className="mt-2 inline-block text-brand-ink hover:underline">Back to Payments</Link>
      </div>
    );
  }

  const inv = state.invoice;
  return (
    <div className="print:bg-white print:text-black">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 print:hidden">
        <Link href="/seller/payments" className="text-sm text-brand-ink hover:underline">← Payments</Link>
        <Button size="sm" variant="outline" onClick={() => window.print()}>Print or save as PDF</Button>
      </div>

      <article className="mx-auto max-w-3xl rounded-xl border border-border bg-background p-6 sm:p-8 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Commission invoice</h1>
            <p className="text-sm text-muted-foreground">{monthName(inv.month)}</p>
          </div>
          <dl className="text-right text-sm">
            <dt className="text-muted-foreground">Number</dt>
            <dd className="font-mono">{inv.number}</dd>
            <dt className="mt-1 text-muted-foreground">Date</dt>
            <dd>{day(inv.issuedAt)}</dd>
          </dl>
        </header>

        <div className="mt-6 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">From</p>
            <p className="font-medium">{inv.from?.legalName}</p>
            <p className="text-muted-foreground">{inv.from?.address}</p>
            <p className="text-muted-foreground">Not registered under GST</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">To</p>
            <p className="font-medium">{inv.to?.legalName}</p>
            {inv.to?.name && inv.to.name !== inv.to.legalName && <p>{inv.to.name}</p>}
            <p className="text-muted-foreground">{inv.to?.address}</p>
            {inv.to?.gstin && <p className="text-muted-foreground">GSTIN {inv.to.gstin}</p>}
          </div>
        </div>

        <table className="mt-8 w-full text-sm tabular-nums">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-normal">Payout</th>
              <th className="py-2 text-right font-normal">Sales</th>
              <th className="py-2 text-right font-normal">Commission</th>
              <th className="py-2 text-right font-normal">Charges</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={l.payoutNumber} className="border-b border-border/60">
                <td className="py-2">
                  {l.payoutNumber}
                  <span className="block text-xs text-muted-foreground">Paid {day(l.paidAt)}{l.periodFrom ? ` · sales ${day(l.periodFrom)} – ${day(l.periodTo)}` : ''}</span>
                </td>
                <td className="py-2 text-right">{money(l.grossSales)}</td>
                <td className="py-2 text-right">{money(l.commission)}</td>
                <td className="py-2 text-right">{money(l.charges)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-semibold" colSpan={2}>Total charged</td>
              <td className="pt-3 text-right">{money(inv.commission)}</td>
              <td className="pt-3 text-right">{money(inv.charges)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="pt-1 text-right font-semibold">Amount</td>
              <td className="pt-1 text-right text-lg font-semibold">{money(inv.total)}</td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-8 text-xs text-muted-foreground">
          Commission on sales and charges for cancelled orders, already kept from the payouts listed above - nothing
          further is due. No GST has been charged: the issuer is not registered under GST. Issued by ShopMaster Pro for
          services to the seller.
        </p>
      </article>
    </div>
  );
}
