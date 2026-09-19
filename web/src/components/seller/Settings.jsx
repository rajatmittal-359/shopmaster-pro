'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';
import PushToggle from '@/components/seller/PushToggle';
import NotificationPrefs from '@/components/common/NotificationPrefs';
import PanelTabs from '@/components/panel/PanelTabs';
import { useT } from '@/lib/i18n';

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
  about: settings.about || '',
  showLocation: Boolean(settings.showLocation),
  // The break switch (Etsy's Vacation Mode): a date is kept as yyyy-mm-dd for the input.
  vacation: { on: Boolean(settings.vacation?.on), until: settings.vacation?.until ? String(settings.vacation.until).slice(0, 10) : '', note: settings.vacation?.note || '' },
  links: { instagram: '', facebook: '', googleBusiness: '', youtube: '', website: '', ...(settings.links || {}) },
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
  const t = useT();
  return (
    <div className={className}>
      <Label htmlFor={id}>{typeof label === 'string' ? t(label) : label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{typeof hint === 'string' ? t(hint) : hint}</p>}
    </div>
  );
}

export default function SellerSettings() {
  const t = useT();
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
      const body = { offersFreeShipping: form.offersFreeShipping, about: form.about, showLocation: form.showLocation, links: form.links };
      if (!same(form.vacation, saved.vacation)) body.vacation = { ...form.vacation, until: form.vacation.until || null };
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
  // Which tab holds an unsaved change - shown as a dot on the tab and named
  // in the save bar, so a change made on one tab is not forgotten on another.
  const changedIn = {
    shop: form.offersFreeShipping !== saved.offersFreeShipping || !same(form.vacation, saved.vacation),
    pickup: !same(form.pickupAddress, saved.pickupAddress),
    web: form.about !== saved.about || form.showLocation !== saved.showLocation || !same(form.links, saved.links),
  };
  const changedNames = [changedIn.shop && t('Shop'), changedIn.pickup && t('Pickup address'), changedIn.web && t('On the web')].filter(Boolean);

  return (
    <form onSubmit={save} className="max-w-3xl space-y-5">
      {/*
       * Four tabs (15 Sep 2026, plan 2.39): the page was 5.6 phone screens
       * of cards. Shopify's Settings is a list of subjects, Stripe's is tabs;
       * ours: Shop · Pickup address · On the web · Notifications. One form,
       * one save bar under every tab, and the bar names the tabs with
       * unsaved changes so nothing is lost behind a tab you left. Old links
       * with #web still land on the right tab (anchors).
       */}
      <PanelTabs
        tabs={[
          { key: 'shop', label: t('Shop'), count: changedIn.shop ? '•' : undefined },
          { key: 'pickup', label: t('Pickup address'), count: !a.city ? '!' : changedIn.pickup ? '•' : undefined, anchors: ['pickup'] },
          { key: 'web', label: t('On the web'), count: changedIn.web ? '•' : undefined, anchors: ['web'] },
          { key: 'notifications', label: t('Notifications') },
        ]}
      >
        {(tab) => (
          <div className="space-y-5">
            {tab === 'shop' && (
              <>
              <PanelCard title={settings.businessName}>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">{t('Platform commission')}</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">
                      {t('{n}% of each sale', { n: settings.commissionRate ?? 0 })}
                      {settings.isPlatformOwned ? ' · the platform’s own shop' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t('Who can change it')}</dt>
                    <dd className="mt-0.5 font-medium">{t('Only an admin')}</dd>
                  </div>
                  {/* The rules this shop agreed to, and when - findable from inside the
                      panel, as Shopify keeps policies under Settings. */}
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">{t('Seller Agreement')}</dt>
                    <dd className="mt-0.5 font-medium">
                      {settings.agreement?.version ? (
                        <>
                          Version {settings.agreement.version}
                          {settings.agreement.acceptedAt
                            ? `, accepted on ${new Date(settings.agreement.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                            : ''}
                        </>
                      ) : (
                        t('Not accepted yet')
                      )}
                      {' · '}
                      <Link href="/selling-policy" target="_blank" rel="noopener" className="font-normal text-brand-ink hover:underline">
                        {t('Read it')}
                      </Link>
                    </dd>
                  </div>
                </dl>
              </PanelCard>

              <PanelCard title={t('Delivery')}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor="freeShipping" className="text-sm font-medium">
                      {t('I pay the delivery on everything I sell')}
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('Shop-wide. Individual products can already be marked free delivery; this covers the rest.')}
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

              {/*
               * A break (19 Sep 2026) - Etsy's Vacation Mode, Seller Central's
               * Holiday settings. One switch and a return date instead of
               * forty products turned off by hand: the listings leave the
               * lists, the pages say when the shop is back, checkout refuses,
               * and it switches itself off the day after the date.
               */}
              <PanelCard title={t('Taking a break')}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor="vacationOn" className="text-sm font-medium">
                      {t('My shop is closed for a few days')}
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('Your products leave the shop lists and cannot be ordered until the date below; your pages stay up and say when you are back. Orders already placed still need to be packed on time.')}
                    </p>
                  </div>
                  <Switch id="vacationOn" checked={form.vacation.on} onCheckedChange={(on) => setForm({ ...form, vacation: { ...form.vacation, on } })} className="mt-0.5" />
                </div>
                {form.vacation.on && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="vacationUntil">{t('Back on')}</Label>
                      <Input id="vacationUntil" type="date" value={form.vacation.until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, vacation: { ...form.vacation, until: e.target.value } })} />
                      <p className="text-xs text-muted-foreground">{t('Up to 60 days. The shop reopens by itself the day after; leave it empty to reopen by hand.')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vacationNote">{t('A line for your customers')}</Label>
                      <Input id="vacationNote" value={form.vacation.note} maxLength={140} placeholder={t('Closed for Diwali - back with new stock')} onChange={(e) => setForm({ ...form, vacation: { ...form.vacation, note: e.target.value } })} />
                    </div>
                  </div>
                )}
              </PanelCard>

              </>
            )}
            {tab === 'pickup' && (
              <div id="pickup" className="scroll-mt-20">
              <PanelCard
                title={t('Where the courier collects')}
                lead={t('This is the address a rider is sent to, and your business address of record - shown in the “Sold by” line on your shop page and on invoices, as the Consumer Protection (E-Commerce) Rules require. If the shop moves and this does not, the pickup is wasted.')}
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

              </div>
            )}
            {tab === 'web' && (
              <>
              {/* The shop's public face - what the shop page and Google see. Reached
                  from "Get found on Google" as #web. */}
              <div id="web" className="scroll-mt-20">
                <PanelCard title={t('Your shop on the web')} lead={t('Shown on your shop page and read by Google. Two honest sentences and your real profiles do more than any keyword.')}>
                  <div className="space-y-5">
                    <Field id="about" label="About your shop" hint={`${form.about.length}/600 · ${t("who you are, what you make or sell, since when. It becomes your page's description on Google.")}`}>
                      <Textarea id="about" value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value.slice(0, 600) })} rows={3} placeholder="Family-run handloom shop in Bapu Bazaar, Jaipur, since 1998. Block-printed bedsheets and dupattas made by hand; every piece photographed on the actual item." />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[
                        ['instagram', 'Instagram', 'instagram.com/yourshop'],
                        ['googleBusiness', t('Google Business Profile'), t('the Share → Copy link from your Google listing')],
                        ['facebook', t('Facebook page'), 'facebook.com/yourshop'],
                        ['youtube', t('YouTube channel'), 'youtube.com/@yourshop'],
                        ['website', t('Your own website'), 'yourshop.in'],
                      ].map(([key, label, ph]) => (
                        <Field key={key} id={`link-${key}`} label={label}>
                          <Input id={`link-${key}`} value={form.links[key] || ''} onChange={(e) => setForm({ ...form, links: { ...form.links, [key]: e.target.value } })} placeholder={ph} className="h-10" inputMode="url" />
                        </Field>
                      ))}
                    </div>
                    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                      <div>
                        <Label htmlFor="showLocation" className="text-sm font-medium">
                          {t('Show my city on the shop page')}
                        </Label>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {form.pickupAddress.city ? `“${form.pickupAddress.city}, ${form.pickupAddress.state}” in the header, beside your rating. (Your business address is also printed in the small “Sold by” line on your shop page - the E-Commerce Rules require it.)` : 'Add a pickup address first (the Pickup address tab).'}
                        </p>
                      </div>
                      <Switch id="showLocation" checked={form.showLocation} onCheckedChange={(checked) => setForm({ ...form, showLocation: checked })} className="mt-0.5" disabled={!form.pickupAddress.city} />
                    </div>
                  </div>
                </PanelCard>
              </div>

              </>
            )}
            {tab === 'notifications' && (
              <>
                <PushToggle />
                <NotificationPrefs />
              </>
            )}
          </div>
        )}
      </PanelTabs>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button type="submit" disabled={!dirty || state.status === 'working'}>
          {state.status === 'working' ? t('Saving…') : t('Save changes')}
        </Button>
        {dirty && (
          <Button type="button" variant="ghost" onClick={() => setForm(saved)} disabled={state.status === 'working'}>
            {t('Discard')}
          </Button>
        )}
        <p aria-live="polite" className="text-sm">
          {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
          {state.status !== 'error' && !dirty && <span className="text-muted-foreground">{t('Nothing to save.')}</span>}
          {state.status !== 'error' && dirty && <span className="text-muted-foreground">{t('Changed: {list}', { list: changedNames.join(', ') })}</span>}
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
