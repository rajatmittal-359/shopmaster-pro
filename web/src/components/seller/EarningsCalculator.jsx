'use client';

/**
 * "What would I get?" on /sell (19 Oct 2026).
 *
 * Amazon has a revenue calculator, Flipkart a fee calculator, Meesho says
 * "0% commission" in the headline: every seller programme answers this before
 * a shop signs up. Ours said "your earning, less commission" and no number.
 *
 * The numbers come from /api/public/seller-earnings, which splits the price
 * with the same code an order is split with - this page never does its own
 * arithmetic, so it cannot disagree with a payout.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiBase } from '@/lib/api';
import { Input } from '@/components/ui/input';

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function EarningsCalculator() {
  const [price, setPrice] = useState('500');
  const [quote, setQuote] = useState(null);

  useEffect(() => {
    const value = Number(price);
    if (!(value > 0)) return undefined;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`${apiBase}/public/seller-earnings?price=${encodeURIComponent(value)}`, { signal: ctrl.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((q) => setQuote(q))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [price]);

  const shown = quote && Number(price) > 0 && quote.price === Number(price) ? quote : null;

  return (
    <section className="mt-10 rounded-xl border border-border p-4 sm:p-5" aria-labelledby="earn-h">
      <h2 id="earn-h" className="text-lg font-semibold">What you get from one sale</h2>
      <label className="mt-3 block text-sm text-muted-foreground" htmlFor="earn-price">
        Your selling price
      </label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-lg">₹</span>
        <Input
          id="earn-price"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, '').slice(0, 9))}
          className="max-w-40 text-lg tabular-nums"
        />
      </div>

      <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm tabular-nums" aria-live="polite">
        <dt className="text-muted-foreground">Commission{shown ? ` (${shown.commissionRate}%)` : ''}</dt>
        <dd className="text-right">{shown ? `− ${rupees(shown.commission)}` : '—'}</dd>
        <dt className="font-semibold">Reaches your bank</dt>
        <dd className="text-right text-xl font-semibold text-brand-ink">{shown ? rupees(shown.youGet) : '—'}</dd>
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        {shown ? `Paid ${shown.paidDaysAfterDelivery} days after the parcel is delivered. ` : ''}
        Delivery is never taken out of this amount, and the payment gateway&rsquo;s fee comes out of our commission, not
        yours. The only other deduction is the charge for cancelling an order you had already accepted - see the{' '}
        <Link href="/selling-policy" className="text-brand-ink hover:underline">selling policy</Link>.
      </p>
    </section>
  );
}
