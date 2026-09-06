import { useCallback, useEffect, useState } from 'react';

import Layout from '../../components/common/Layout';
import Button from '../../components/ui/Button';
import { getSellerSettings, updateSellerSettings } from '../../services/sellerService';
import { toastSuccess, toastError } from '../../utils/toast';

/**
 * The two things a seller decides about their own shop.
 *
 * WHY THIS PAGE EXISTS
 *   Free shipping was a flag on each PRODUCT and nowhere else. A seller who had
 *   decided their shop absorbs delivery had to tick every item they owned, and
 *   every new one forever - which is not a decision anybody can keep.
 *
 *   The pickup address did not exist at all. Shipping read one address out of
 *   the environment and used it for every seller, so any seller but the
 *   platform's own shop would have had a courier sent to the wrong door.
 *
 * WHAT IS DELIBERATELY READ-ONLY
 *   The commission rate. It is shown, because a seller seeing what the platform
 *   charges is the difference between a fee and a deduction they discover in a
 *   payout - but only an admin can change it, for the obvious reason.
 */
const BLANK = {
  contactName: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  pincode: '',
  phone: '',
};

export default function SellerSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [address, setAddress] = useState(BLANK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await getSellerSettings();
      // One write, not two: the address is part of the settings we just read,
      // and setting them separately makes React render an inconsistent pair.
      setSettings(data.settings);
      setAddress(() => ({ ...BLANK, ...(data.settings.pickupAddress || {}) }));
    } catch (err) {
      toastError(err?.response?.data?.message || 'Could not load your settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch) => {
    setSaving(true);
    try {
      const { data } = await updateSellerSettings(patch);
      setSettings((s) => ({ ...s, ...data.settings }));
      toastSuccess(data.message || 'Saved');
    } catch (err) {
      toastError(err?.response?.data?.message || 'That did not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Settings">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (!settings) {
    return (
      <Layout title="Settings">
        <p className="text-gray-700">We could not load your settings.</p>
      </Layout>
    );
  }

  const field = (name, label, extra = {}) => (
    <div>
      <label htmlFor={`pa-${name}`} className="block text-sm text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={`pa-${name}`}
        value={address[name] || ''}
        onChange={(e) => setAddress((a) => ({ ...a, [name]: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-fill"
        {...extra}
      />
    </div>
  );

  return (
    <Layout title="Settings">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Who pays the delivery. */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-gray-900">I pay the delivery</h2>
              <p className="text-sm text-gray-600 mt-1">
                Customers see “Free delivery” on everything you sell, and the courier’s
                charge comes out of what you earn. Turn it off and delivery is quoted
                to the customer at checkout as usual.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.offersFreeShipping}
              aria-label="I pay the delivery"
              disabled={saving}
              onClick={() => save({ offersFreeShipping: !settings.offersFreeShipping })}
              className={`shrink-0 w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${
                settings.offersFreeShipping ? 'bg-brand-fill' : 'bg-gray-300'
              }`}
            >
              <span
                className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.offersFreeShipping ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/*
            The per-product flag still wins, and saying so matters: a seller
            turning this off would otherwise expect it to start charging for an
            item they had deliberately made free.
          */}
          <p className="text-xs text-gray-500 mt-3">
            Any product you have individually marked as free stays free either way.
          </p>
        </section>

        {/* Where a courier comes. */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900">Where the courier collects from</h2>
          <p className="text-sm text-gray-600 mt-1">
            A rider comes to this address to pick up your parcels, and returns come
            back here. You cannot ship without it.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {field('contactName', 'Who the rider asks for')}
            {field('phone', 'Phone they can call', { inputMode: 'numeric', maxLength: 10 })}
            <div className="sm:col-span-2">{field('address1', 'Address')}</div>
            <div className="sm:col-span-2">
              {field('address2', 'Landmark (optional)')}
            </div>
            {field('city', 'City')}
            {field('state', 'State')}
            {field('pincode', 'PIN code', { inputMode: 'numeric', maxLength: 6 })}
          </div>

          <Button
            className="mt-4"
            loading={saving}
            onClick={() => save({ pickupAddress: address })}
          >
            Save this address
          </Button>
        </section>

        {/* What the platform charges. Shown, not editable. */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900">Platform commission</h2>
          <p className="text-2xl font-semibold text-gray-900 mt-2 tabular-nums">
            {settings.commissionRate}%
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {settings.commissionRate === 0
              ? 'You keep the whole sale. Nothing is deducted.'
              : 'Taken from the item value of each sale, never from delivery.'}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Every order records the rate it was sold under, so a change never
            affects an order already placed.
          </p>
        </section>
      </div>
    </Layout>
  );
}
