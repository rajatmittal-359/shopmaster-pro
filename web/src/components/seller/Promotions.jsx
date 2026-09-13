'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Promotions - the seller's own coupons.
 *
 * WHAT IT IS
 *   Shopify's Discounts, Meesho's and Flipkart's seller promotions: a code the
 *   seller funds, off their own lines only (utils/applyCoupon on the server
 *   splits the basket by seller). Until today only the admin could make a
 *   coupon, which meant a seller could not run a sale - the one thing every
 *   shopkeeper knows how to do.
 *
 * WHERE IT GOES
 *   The code works at checkout, shows on the public Coupons page, and - once
 *   the platform's promotions feed picks it up overnight - under the seller's
 *   products in Google Shopping. Three places for one form.
 *
 * WHAT THE FORM REFUSES
 *   More than 90% off (a typo, not a sale), a rupee amount below 1, a code
 *   somebody else already uses. The server says it in words; the toast repeats.
 */
const EMPTY = { code: '', type: 'percent', value: '', maxDiscount: '', minOrderValue: '', validUntil: '', usageLimit: '', description: '' };

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null);

const describe = (c) =>
  `${c.type === 'percent' ? `${c.value}% off` : `${money(c.value)} off`}${c.minOrderValue > 0 ? ` on orders over ${money(c.minOrderValue)}` : ''}${c.type === 'percent' && c.maxDiscount ? `, up to ${money(c.maxDiscount)}` : ''}`;

export default function Promotions() {
  const [coupons, setCoupons] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/coupons')
      .then((d) => {
        if (!cancelled) setCoupons(d.coupons || []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, code: form.code.trim().toUpperCase(), validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : null };
      const d = await authedFetch('/seller/coupons', { method: 'POST', body });
      setCoupons((c) => [d.coupon, ...(c || [])]);
      setForm(EMPTY);
      setOpen(false);
      toast.success(`${d.coupon.code} is live`, { description: 'Works at checkout now; on Google Shopping after tonight’s feed.' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c) => {
    try {
      const d = await authedFetch(`/seller/coupons/${c._id}/toggle`, { method: 'PATCH' });
      setCoupons((list) => list.map((x) => (x._id === c._id ? d.coupon : x)));
      toast(d.coupon.isActive ? `${c.code} switched on` : `${c.code} paused`, { action: { label: 'Undo', onClick: () => toggle(d.coupon) } });
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!coupons) {
    return (
      <div className="skeleton-in space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const live = coupons.filter((c) => c.isActive && !c.expired);
  const rest = coupons.filter((c) => !(c.isActive && !c.expired));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {live.length ? `${live.length} live code${live.length === 1 ? '' : 's'}. ` : 'No live codes yet. '}
          A coupon comes off your own items only - the platform never pays for your sale, and you never pay for theirs.
        </p>
        <Button onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'New coupon'}</Button>
      </div>

      {open && (
        <PanelCard title="New coupon" lead="A short code people can type. It works the moment you save.">
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" value={form.code} onChange={set('code')} placeholder="DIWALI20" required maxLength={24} className="uppercase" />
              <p className="text-xs text-muted-foreground">Letters and numbers, 3–24. Unique across the site.</p>
            </div>
            <div className="space-y-1.5">
              <Label>What it takes off</Label>
              <div className="flex gap-2">
                <select value={form.type} onChange={set('type')} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="percent">Percent</option>
                  <option value="flat">Rupees</option>
                </select>
                <Input type="number" min={1} max={form.type === 'percent' ? 90 : undefined} value={form.value} onChange={set('value')} placeholder={form.type === 'percent' ? '20' : '100'} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="min">Minimum order (optional)</Label>
              <Input id="min" type="number" min={0} value={form.minOrderValue} onChange={set('minOrderValue')} placeholder="999" />
            </div>
            {form.type === 'percent' && (
              <div className="space-y-1.5">
                <Label htmlFor="cap">Maximum discount (optional)</Label>
                <Input id="cap" type="number" min={1} value={form.maxDiscount} onChange={set('maxDiscount')} placeholder="300" />
                <p className="text-xs text-muted-foreground">Stops 20% on a ₹9,000 choker becoming ₹1,800.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="until">Last day (optional)</Label>
              <Input id="until" type="date" value={form.validUntil} onChange={set('validUntil')} min={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="limit">How many times in total (optional)</Label>
              <Input id="limit" type="number" min={1} value={form.usageLimit} onChange={set('usageLimit')} placeholder="100" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="desc">Shown to the customer (optional)</Label>
              <Input id="desc" value={form.description} onChange={set('description')} placeholder="Diwali week - 20% off everything" maxLength={120} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save and go live'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </PanelCard>
      )}

      <PanelCard title="Live" lead={live.length ? 'Working at checkout right now.' : undefined}>
        {live.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Nothing live. Sellers who run one code a month sell more in that month - Diwali, a wedding season, a slow week.</p>
        ) : (
          <ul className="divide-y">
            {live.map((c) => (
              <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-0.5 text-sm font-semibold tracking-wide">{c.code}</code>
                    <span className="text-sm">{describe(c)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Used {c.usedCount}{c.usageLimit ? ` of ${c.usageLimit}` : ''}
                    {c.validUntil ? ` · until ${when(c.validUntil)}` : ' · no end date'}
                    {c.description ? ` · “${c.description}”` : ''}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggle(c)}>
                  Pause
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      {rest.length > 0 && (
        <PanelCard title="Paused or over">
          <ul className="divide-y">
            {rest.map((c) => (
              <li key={c._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 text-muted-foreground">
                  <code className="rounded bg-muted px-2 py-0.5 font-semibold tracking-wide">{c.code}</code> {describe(c)}
                  <span className="ml-2 text-xs">{c.expired ? `ended ${when(c.validUntil)}` : 'paused'} · used {c.usedCount}</span>
                </div>
                {!c.expired && (
                  <Button size="sm" variant="ghost" onClick={() => toggle(c)}>
                    Switch on
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </PanelCard>
      )}
    </div>
  );
}
