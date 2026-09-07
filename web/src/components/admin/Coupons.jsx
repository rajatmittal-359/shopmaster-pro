'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Discount codes.
 *
 * WHO PAYS IS A REQUIRED CHOICE
 *   `fundedBy` decides whether the discount comes out of the platform's
 *   commission or out of the seller's earning. It is not a detail: a coupon
 *   funded by the wrong side is money taken from somebody who never agreed to
 *   spend it, and it surfaces at payout time - weeks later, as an argument.
 *
 * A CODE IS NEVER DELETED, ONLY SWITCHED OFF
 *   Orders that used it keep pointing at it, and the usage counts are how a
 *   limit is enforced. Deleting one would break both.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const BLANK = {
  code: '',
  description: '',
  type: 'percent',
  value: '',
  maxDiscount: '',
  minOrderValue: '',
  fundedBy: 'platform',
  validUntil: '',
  usageLimit: '',
  perCustomerLimit: 1,
};

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [state, setState] = useState({ status: 'loading' });

  const load = async () => {
    const data = await authedFetch('/admin/coupons');
    setCoupons(data.coupons || []);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/admin/coupons');
        if (cancelled) return;
        setCoupons(data.coupons || []);
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

  const create = (e) => {
    e.preventDefault();
    run(async () => {
      await authedFetch('/admin/coupons', {
        method: 'POST',
        body: {
          ...form,
          value: Number(form.value),
          maxDiscount: form.maxDiscount === '' ? undefined : Number(form.maxDiscount),
          minOrderValue: form.minOrderValue === '' ? 0 : Number(form.minOrderValue),
          usageLimit: form.usageLimit === '' ? undefined : Number(form.usageLimit),
          perCustomerLimit: Number(form.perCustomerLimit) || 1,
          validUntil: form.validUntil || undefined,
        },
      });
      setForm(BLANK);
    });
  };

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const selectClass = 'rounded-md border border-border bg-background px-3 py-2 text-sm';

  return (
    <div className="space-y-8">
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <form onSubmit={create} className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-semibold">Create a code</h2>

        <div className="grid gap-3 sm:grid-cols-4">
          <Input
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="DIWALI200"
            aria-label="Code"
          />
          <select value={form.type} onChange={set('type')} aria-label="Type" className={selectClass}>
            <option value="percent">Percent off</option>
            <option value="flat">Flat amount off</option>
          </select>
          <Input
            required
            value={form.value}
            onChange={set('value')}
            placeholder={form.type === 'percent' ? '10' : '200'}
            aria-label="Value"
          />
          <select
            value={form.fundedBy}
            onChange={set('fundedBy')}
            aria-label="Funded by"
            className={selectClass}
          >
            <option value="platform">The platform pays for it</option>
            <option value="seller">The seller pays for it</option>
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Input
            value={form.minOrderValue}
            onChange={set('minOrderValue')}
            placeholder="Minimum basket"
            aria-label="Minimum order value"
          />
          <Input
            value={form.maxDiscount}
            onChange={set('maxDiscount')}
            placeholder="Cap the discount"
            aria-label="Maximum discount"
          />
          <Input
            type="date"
            value={form.validUntil}
            onChange={set('validUntil')}
            aria-label="Valid until"
          />
          <Input
            value={form.usageLimit}
            onChange={set('usageLimit')}
            placeholder="Total uses allowed"
            aria-label="Usage limit"
          />
        </div>

        <Input
          value={form.description}
          onChange={set('description')}
          placeholder="What it is for - the customer sees this"
          aria-label="Description"
        />

        <Button type="submit" disabled={state.status === 'working'}>
          Create it
        </Button>

        <p className="text-xs text-muted-foreground">
          A percent code with no cap can cost more than the order earns. Put a cap
          on anything above 10%.
        </p>
      </form>

      {coupons.length === 0 ? (
        <p className="text-muted-foreground">No codes yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {coupons.map((coupon) => (
            <li key={coupon._id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="min-w-0 flex-1">
                <strong>{coupon.code}</strong>
                {' · '}
                {coupon.type === 'percent' ? `${coupon.value}% off` : `${money(coupon.value)} off`}
                {coupon.maxDiscount ? ` (max ${money(coupon.maxDiscount)})` : ''}
                {coupon.minOrderValue ? ` · over ${money(coupon.minOrderValue)}` : ''}
                <span className="block text-xs text-muted-foreground">
                  Paid for by the {coupon.fundedBy} · used {coupon.usedCount || 0}
                  {coupon.usageLimit ? ` of ${coupon.usageLimit}` : ''} time(s)
                  {coupon.validUntil
                    ? ` · until ${new Date(coupon.validUntil).toLocaleDateString('en-IN')}`
                    : ''}
                </span>
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  run(() => authedFetch(`/admin/coupons/${coupon._id}/toggle`, { method: 'PATCH' }))
                }
              >
                {coupon.isActive ? 'Switch off' : 'Switch on'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
