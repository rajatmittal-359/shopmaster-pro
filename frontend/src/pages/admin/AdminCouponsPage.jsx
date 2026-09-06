import { useCallback, useEffect, useState } from 'react';

import Layout from '../../components/common/Layout';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import {
  getCoupons,
  createCoupon,
  toggleCoupon,
  getPendingSellers,
} from '../../services/adminService';
import { toastSuccess, toastError } from '../../utils/toast';
import { money } from '../../utils/money';
import { useConfirm } from '../../context/confirmContext';

/**
 * Codes that take money off a basket.
 *
 * THE FIELD THAT MATTERS MOST IS `fundedBy`
 *   A discount is somebody paying part of the customer's bill. Platform-funded
 *   comes out of our commission and can leave us out of pocket on a line;
 *   seller-funded comes out of the seller's own gross. The form makes that a
 *   deliberate choice rather than a default, because it is the one thing here
 *   that cannot be corrected afterwards - orders snapshot it at the sale.
 *
 * WHY EVERY LIMIT IS ON THE FORM
 *   A code with no ceiling is a hole in the till. The form shows all four -
 *   total uses, per customer, minimum basket, maximum discount - so leaving one
 *   blank is a decision somebody made rather than a field they never saw.
 */
const BLANK = {
  code: '',
  description: '',
  type: 'percent',
  value: '',
  maxDiscount: '',
  minOrderValue: '',
  fundedBy: 'platform',
  sellerId: '',
  validUntil: '',
  usageLimit: '',
  perCustomerLimit: '1',
};

const when = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(BLANK);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const [{ data }, sellerRes] = await Promise.all([getCoupons(), getPendingSellers()]);
      setCoupons(data.coupons || []);
      setSellers(sellerRes.data.sellers || []);
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not load the coupons');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (form.fundedBy === 'seller' && !form.sellerId) {
      toastError('Pick which seller is paying for it');
      return;
    }

    setBusy(true);
    try {
      await createCoupon({
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        type: form.type,
        value: Number(form.value),
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
        minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : 0,
        fundedBy: form.fundedBy,
        sellerId: form.fundedBy === 'seller' ? form.sellerId : null,
        validUntil: form.validUntil || null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : 1,
      });

      toastSuccess(`${form.code.toUpperCase()} is live`);
      setCreating(false);
      setForm(BLANK);
      await load();
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not create that coupon');
    } finally {
      setBusy(false);
    }
  };

  const flip = async (coupon) => {
    if (coupon.isActive) {
      const sure = await confirm({
        title: `Switch off ${coupon.code}?`,
        message:
          'Nobody can use it after this. Orders already placed with it keep their discount — nothing is taken back.',
        confirmLabel: 'Switch it off',
        cancelLabel: 'Leave it running',
      });
      if (!sure) return;
    }

    try {
      const { data } = await toggleCoupon(coupon._id);
      toastSuccess(data.message);
      await load();
    } catch (err) {
      toastError(err?.response?.data?.message || 'That did not work');
    }
  };

  const field = (label, key, extra = {}, hint) => (
    <div>
      <label htmlFor={`c-${key}`} className="block text-sm text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={`c-${key}`}
        value={form[key]}
        onChange={set(key)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-fill"
        {...extra}
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );

  return (
    <Layout title="Coupons">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-gray-900">Coupons</h2>
        <Button onClick={() => setCreating(true)}>New coupon</Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : !coupons.length ? (
        <EmptyState
          title="No coupons yet"
          hint="A code takes money off a basket. Who pays for it — you or the seller — is decided when you create it."
        />
      ) : (
        <div className="space-y-3">
          {coupons.map((c) => (
            <div
              key={c._id}
              className={`bg-white rounded-xl border p-4 ${
                c.isActive ? 'border-gray-200' : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 tracking-wide">{c.code}</span>
                    <span className="text-sm text-gray-700">
                      {c.type === 'percent' ? `${c.value}% off` : `${money(c.value)} off`}
                      {c.maxDiscount ? ` (max ${money(c.maxDiscount)})` : ''}
                    </span>

                    {/* The field that decides whose money this is. */}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-lg ${
                        c.fundedBy === 'platform'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-positive-tint text-positive'
                      }`}
                    >
                      {c.fundedBy === 'platform' ? 'We pay' : 'Seller pays'}
                    </span>

                    {!c.isActive && (
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600">
                        Off
                      </span>
                    )}
                  </div>

                  {c.description && (
                    <p className="text-sm text-gray-600 mt-1">{c.description}</p>
                  )}

                  <p className="text-xs text-gray-500 mt-1.5">
                    {c.minOrderValue > 0 && `Min ${money(c.minOrderValue)} · `}
                    Used {c.usedCount}
                    {c.usageLimit ? ` of ${c.usageLimit}` : ' times'}
                    {c.perCustomerLimit ? ` · ${c.perCustomerLimit} per customer` : ''}
                    {c.validUntil ? ` · until ${when(c.validUntil)}` : ''}
                  </p>
                </div>

                <Button
                  variant={c.isActive ? 'secondary' : 'primary'}
                  size="sm"
                  onClick={() => flip(c)}
                >
                  {c.isActive ? 'Switch off' : 'Switch on'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={creating}
        title="New coupon"
        hint="Whoever funds it pays for it out of their own share. That cannot be changed later."
        onClose={() => setCreating(false)}
      >
        <div className="space-y-3">
          {field('Code', 'code', { placeholder: 'FESTIVE20', maxLength: 24 }, 'Letters and numbers only — customers have to type it.')}
          {field('What it is for', 'description', { placeholder: 'Diwali launch offer' })}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="c-type" className="block text-sm text-gray-700 mb-1">
                Type
              </label>
              <select
                id="c-type"
                value={form.type}
                onChange={set('type')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="percent">Percentage off</option>
                <option value="flat">Flat rupees off</option>
              </select>
            </div>
            {field(form.type === 'percent' ? 'Percent' : 'Rupees', 'value', {
              type: 'number',
              min: 0,
            })}
          </div>

          {/*
            Only shown for a percentage, because a flat coupon is already its own
            ceiling. Without one, 20% off is unbounded on a large basket.
          */}
          {form.type === 'percent' &&
            field('Most it can take off', 'maxDiscount', { type: 'number', min: 0, placeholder: '500' },
              'Leave blank for no ceiling — 20% of a large order can be a lot.')}

          {field('Minimum basket', 'minOrderValue', { type: 'number', min: 0, placeholder: '0' })}

          <div>
            <label htmlFor="c-funded" className="block text-sm text-gray-700 mb-1">
              Who pays for it
            </label>
            <select
              id="c-funded"
              value={form.fundedBy}
              onChange={set('fundedBy')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="platform">We do — out of our commission</option>
              <option value="seller">The seller does — out of their sale</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {form.fundedBy === 'platform'
                ? 'The seller is paid in full as if there were no discount. On a big enough discount we make a loss on the line.'
                : 'The seller’s earning drops, and our commission drops with it. It only applies to their own items.'}
            </p>
          </div>

          {form.fundedBy === 'seller' && (
            <div>
              <label htmlFor="c-seller" className="block text-sm text-gray-700 mb-1">
                Which seller
              </label>
              <select
                id="c-seller"
                value={form.sellerId}
                onChange={set('sellerId')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Pick a seller…</option>
                {sellers.map((s) => (
                  <option key={s._id} value={s.userId?._id || s.userId}>
                    {s.businessName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {field('Total uses', 'usageLimit', { type: 'number', min: 1, placeholder: 'Unlimited' })}
            {field('Per customer', 'perCustomerLimit', { type: 'number', min: 1 })}
          </div>

          {field('Runs until', 'validUntil', { type: 'date' },
            'Leave blank and it runs until you switch it off.')}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setCreating(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={busy}
            disabled={!form.code.trim() || !form.value}
          >
            Create it
          </Button>
        </div>
      </Modal>
    </Layout>
  );
}
