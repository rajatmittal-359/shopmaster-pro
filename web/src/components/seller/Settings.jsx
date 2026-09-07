'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * A seller's own settings.
 *
 * THE PICKUP ADDRESS IS NOT COSMETIC
 *   It is where the courier turns up. The shop moved once and Shiprocket was
 *   never told, and a rider went to the old address - which is a wasted pickup,
 *   a missed dispatch promise, and a customer who thinks the parcel is lost.
 *
 * FREE DELIVERY IS A SHOP-WIDE SWITCH
 *   Separate from the per-product flag on purpose: a seller who decides to
 *   absorb delivery decides it for their whole shop, and editing forty products
 *   to say so is how it ends up true for thirty of them.
 *
 * COMMISSION IS SHOWN, NOT EDITABLE
 *   Only an admin can change it. Seeing it is what makes it a fee rather than
 *   a deduction discovered in a payout.
 */
export default function SellerSettings() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/seller/settings');
        if (cancelled) return;
        setSettings(data.settings);
        setForm({
          offersFreeShipping: Boolean(data.settings.offersFreeShipping),
          pickupAddress: { ...(data.settings.pickupAddress || {}) },
        });
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setState({ status: 'working' });
    try {
      const data = await authedFetch('/seller/settings', { method: 'PATCH', body: form });
      setSettings(data.settings || settings);
      setState({ status: 'saved' });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (state.status === 'loading' || !form) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const setAddress = (key) => (e) =>
    setForm({ ...form, pickupAddress: { ...form.pickupAddress, [key]: e.target.value } });

  return (
    <form onSubmit={save} className="max-w-2xl space-y-6">
      <section className="rounded-xl border border-border p-4">
        <h2 className="font-semibold">{settings.businessName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The platform charges you {settings.commissionRate ?? 0}% commission
          {settings.isPlatformOwned ? ' (this is the platform’s own shop)' : ''}. Only
          an admin can change that.
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-semibold">Where the courier collects</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={form.pickupAddress.contactName || ''}
            onChange={setAddress('contactName')}
            placeholder="Who the rider asks for"
            aria-label="Contact name"
          />
          <Input
            value={form.pickupAddress.phone || ''}
            onChange={setAddress('phone')}
            placeholder="Phone"
            aria-label="Pickup phone"
          />
        </div>

        <Input
          value={form.pickupAddress.address1 || ''}
          onChange={setAddress('address1')}
          placeholder="Address"
          aria-label="Address line 1"
        />
        <Input
          value={form.pickupAddress.address2 || ''}
          onChange={setAddress('address2')}
          placeholder="Landmark or second line"
          aria-label="Address line 2"
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            value={form.pickupAddress.city || ''}
            onChange={setAddress('city')}
            placeholder="City"
            aria-label="City"
          />
          <Input
            value={form.pickupAddress.state || ''}
            onChange={setAddress('state')}
            placeholder="State"
            aria-label="State"
          />
          <Input
            value={form.pickupAddress.pincode || ''}
            onChange={(e) =>
              setForm({
                ...form,
                pickupAddress: {
                  ...form.pickupAddress,
                  pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                },
              })
            }
            placeholder="PIN code"
            aria-label="PIN code"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          This is the address a rider is sent to. If the shop moves and this does
          not, the pickup is wasted and the parcel misses its dispatch promise.
        </p>
      </section>

      <section className="rounded-xl border border-border p-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.offersFreeShipping}
            onChange={(e) => setForm({ ...form, offersFreeShipping: e.target.checked })}
            className="mt-1"
          />
          <span>
            <strong>I pay the delivery on everything I sell</strong>
            <span className="block text-muted-foreground">
              Shop-wide. Individual products can already be marked free
              delivery; this covers the rest.
            </span>
          </span>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={state.status === 'working'}>
          {state.status === 'working' ? 'Saving…' : 'Save'}
        </Button>
        <p aria-live="polite" className="text-sm">
          {state.status === 'saved' && <span className="text-muted-foreground">Saved.</span>}
          {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}
