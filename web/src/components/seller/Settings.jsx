'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';

/**
 * A seller's own settings.
 *
 * THE SHAPE, FROM THE REFERENCES
 *   Shopify's settings pages: one card per subject, every field with its
 *   label above it and its hint below (Baymard - placeholders vanish the
 *   moment you type, so a form that relies on them cannot be checked before
 *   it is sent), a switch for a shop-wide yes/no, and a save bar that only
 *   wakes up once something has actually changed. Nothing to save, nothing
 *   to press.
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
const formFrom = (settings) => ({
  offersFreeShipping: Boolean(settings.offersFreeShipping),
  pickupAddress: {
    contactName: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    pincode: '',
    ...(settings.pickupAddress || {}),
  },
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function Field({ id, label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function SellerSettings() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(null); // the form as last saved - what "dirty" is measured against
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/seller/settings');
        if (cancelled) return;
        const initial = formFrom(data.settings);
        setSettings(data.settings);
        setSaved(initial);
        setForm(initial);
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
      // Only what changed. The server checks a pickup address in full, so
      // sending an untouched empty one would stop a new seller from flipping
      // the delivery switch until they had typed an address.
      const body = { offersFreeShipping: form.offersFreeShipping };
      if (!same(form.pickupAddress, saved.pickupAddress)) body.pickupAddress = form.pickupAddress;
      const data = await authedFetch('/seller/settings', { method: 'PATCH', body });
      const next = data.settings || settings;
      const asForm = formFrom(next);
      setSettings(next);
      setSaved(asForm);
      setForm(asForm);
      setState({ status: 'idle' });
      toast.success('Saved');
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (state.status === 'loading') return <SettingsSkeleton />;
  if (state.status === 'error' && !form) return <p className="text-sm text-destructive">{state.message}</p>;

  const dirty = !same(form, saved);
  const setAddress = (key) => (e) =>
    setForm({ ...form, pickupAddress: { ...form.pickupAddress, [key]: e.target.value } });
  const a = form.pickupAddress;

  return (
    <form onSubmit={save} className="max-w-3xl space-y-5">
      <PanelCard title={settings.businessName}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Platform commission</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {settings.commissionRate ?? 0}% of each sale
              {settings.isPlatformOwned ? ' · the platform’s own shop' : ''}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Who can change it</dt>
            <dd className="mt-0.5 font-medium">Only an admin</dd>
          </div>
        </dl>
      </PanelCard>

      <PanelCard
        title="Where the courier collects"
        lead="This is the address a rider is sent to. If the shop moves and this does not, the pickup is wasted and the parcel misses its dispatch promise."
      >
        <div className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="contactName" label="Contact name" hint="Who the rider asks for at the door.">
              <Input id="contactName" value={a.contactName || ''} onChange={setAddress('contactName')} autoComplete="name" />
            </Field>
            <Field id="phone" label="Phone">
              <Input id="phone" type="tel" inputMode="tel" value={a.phone || ''} onChange={setAddress('phone')} autoComplete="tel" />
            </Field>
          </div>

          <Field id="address1" label="Address">
            <Input id="address1" value={a.address1 || ''} onChange={setAddress('address1')} autoComplete="address-line1" />
          </Field>
          <Field id="address2" label="Landmark or second line" hint="Optional.">
            <Input id="address2" value={a.address2 || ''} onChange={setAddress('address2')} autoComplete="address-line2" />
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="city" label="City">
              <Input id="city" value={a.city || ''} onChange={setAddress('city')} autoComplete="address-level2" />
            </Field>
            <Field id="state" label="State">
              <Input id="state" value={a.state || ''} onChange={setAddress('state')} autoComplete="address-level1" />
            </Field>
            <Field id="pincode" label="PIN code">
              <Input
                id="pincode"
                inputMode="numeric"
                autoComplete="postal-code"
                value={a.pincode || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pickupAddress: { ...a, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) },
                  })
                }
              />
            </Field>
          </div>
        </div>
      </PanelCard>

      <PanelCard title="Delivery">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="freeShipping" className="text-sm font-medium">
              I pay the delivery on everything I sell
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              Shop-wide. Individual products can already be marked free delivery; this covers the rest.
            </p>
          </div>
          <Switch
            id="freeShipping"
            checked={form.offersFreeShipping}
            onCheckedChange={(checked) => setForm({ ...form, offersFreeShipping: checked })}
            className="mt-0.5"
          />
        </div>
      </PanelCard>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button type="submit" disabled={!dirty || state.status === 'working'}>
          {state.status === 'working' ? 'Saving…' : 'Save changes'}
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" onClick={() => setForm(saved)} disabled={state.status === 'working'}>
            Discard
          </Button>
        )}
        <p aria-live="polite" className="text-sm">
          {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
          {state.status !== 'error' && !dirty && <span className="text-muted-foreground">Nothing to save.</span>}
        </p>
      </div>
    </form>
  );
}

function SettingsSkeleton() {
  return (
    <div className="skeleton-in max-w-3xl space-y-5" aria-busy="true" aria-label="Loading settings">
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-40" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-2 h-4 w-full" />
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="mt-5 h-16 w-full" />
        <Skeleton className="mt-5 h-16 w-full" />
      </div>
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-4 h-10 w-full" />
      </div>
    </div>
  );
}
