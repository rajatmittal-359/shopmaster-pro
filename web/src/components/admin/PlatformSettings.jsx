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
import PanelTabs from '@/components/panel/PanelTabs';
import ActionDialog from '@/components/common/ActionDialog';

/**
 * Settings - the platform's own, edited here instead of in code.
 *
 * Shopify's Settings page in shape: identity, links, the rulebook, what is
 * switched on, the announcement bar. Each block saves on its own. The
 * rulebook block warns before saving: a changed number is a new version of
 * the Seller Agreement and every seller accepts it again.
 */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function Field({ id, label, hint, children }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Block({ title, lead, form, saved, onSave, busy, children, confirm }) {
  const dirty = !same(form, saved);
  const [asking, setAsking] = useState(false);
  return (
    <PanelCard title={title} lead={lead}>
      <div className="space-y-4">{children}</div>
      <div className="mt-5 flex items-center gap-2">
        <Button size="sm" disabled={!dirty || busy} onClick={() => (confirm ? setAsking(true) : onSave())}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
      {confirm && (
        <ActionDialog
          open={asking}
          onOpenChange={setAsking}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.label}
          destructive
          busy={busy}
          onConfirm={() => {
            setAsking(false);
            onSave();
          }}
        />
      )}
    </PanelCard>
  );
}

export default function PlatformSettings() {
  const [doc, setDoc] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    authedFetch('/admin/settings')
      .then((d) => {
        if (cancelled) return;
        setDoc(d.settings);
        setDefaults(d.defaults);
        setForm(JSON.parse(JSON.stringify(d.settings)));
      })
      .catch((err) => toast.error(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!form) {
    return (
      <div className="skeleton-in space-y-4" aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const save = async (block) => {
    setBusy(block);
    try {
      const d = await authedFetch('/admin/settings', { method: 'PATCH', body: { [block]: form[block] } });
      setDoc(d.settings);
      setForm((f) => ({ ...f, [block]: JSON.parse(JSON.stringify(d.settings[block])) }));
      toast.success(block === 'rules' ? `Rules saved - Seller Agreement is now v${d.rulesVersion}` : 'Saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };
  const set = (block, key) => (e) => setForm({ ...form, [block]: { ...form[block], [key]: e?.target ? e.target.value : e } });
  const setNum = (block, key) => (e) => setForm({ ...form, [block]: { ...form[block], [key]: e.target.value === '' ? '' : Number(e.target.value) } });

  const b = form.business;
  const l = form.links;
  const r = form.rules;
  const s = form.shop;
  const a = form.announcement;

  return (
    <>
      {/*
       * Tabs (15 Sep 2026, plan 2.39): five self-saving blocks were 5.6
       * phone screens. Business · Rulebook · Switches · Announcement; a dot
       * on a tab means it holds an unsaved change.
       */}
      <PanelTabs
        tabs={[
          { key: 'business', label: 'Business', count: !same(b, doc.business) || !same(l, doc.links) ? '•' : undefined },
          { key: 'rules', label: `Rulebook v${doc.rules.version}`, count: !same(r, doc.rules) ? '•' : undefined },
          { key: 'switches', label: 'Switches', count: !same(s, doc.shop) ? '•' : undefined },
          { key: 'announcement', label: 'Announcement', count: !same(a, doc.announcement) ? '•' : undefined },
        ]}
      >
        {(tab) => (
          <div className="space-y-6">
            {tab === 'business' && (
              <>
              <Block title="Who we are" lead="Printed on Contact, the footer, invoices and the site's structured data. Change it here, it changes everywhere." form={b} saved={doc.business} onSave={() => save('business')} busy={busy === 'business'}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="tradeName" label="Site name">
                    <Input id="tradeName" value={b.tradeName} onChange={set('business', 'tradeName')} />
                  </Field>
                  <Field id="legalName" label="Legal / operating name" hint="The entity that runs the site - on the bill of supply.">
                    <Input id="legalName" value={b.legalName} onChange={set('business', 'legalName')} />
                  </Field>
                  <Field id="tagline" label="Tagline">
                    <Input id="tagline" value={b.tagline} onChange={set('business', 'tagline')} />
                  </Field>
                  <Field id="email" label="Email">
                    <Input id="email" value={b.email} onChange={set('business', 'email')} inputMode="email" />
                  </Field>
                  <Field id="phone" label="Phone">
                    <Input id="phone" value={b.phone} onChange={set('business', 'phone')} inputMode="tel" />
                  </Field>
                  <Field id="whatsapp" label="WhatsApp number" hint="Digits with country code, e.g. 919876543210.">
                    <Input id="whatsapp" value={b.whatsapp} onChange={set('business', 'whatsapp')} inputMode="tel" />
                  </Field>
                  <Field id="address1" label="Address line 1">
                    <Input id="address1" value={b.address1} onChange={set('business', 'address1')} />
                  </Field>
                  <Field id="address2" label="Address line 2 / landmark">
                    <Input id="address2" value={b.address2} onChange={set('business', 'address2')} />
                  </Field>
                  <Field id="city" label="City">
                    <Input id="city" value={b.city} onChange={set('business', 'city')} />
                  </Field>
                  <Field id="state" label="State">
                    <Input id="state" value={b.state} onChange={set('business', 'state')} />
                  </Field>
                  <Field id="pincode" label="PIN code">
                    <Input id="pincode" value={b.pincode} onChange={set('business', 'pincode')} inputMode="numeric" />
                  </Field>
                  <Field id="hours" label="Hours">
                    <Input id="hours" value={b.hours} onChange={set('business', 'hours')} />
                  </Field>
                  <Field id="gstin" label="GSTIN (if any)">
                    <Input id="gstin" value={b.gstin} onChange={set('business', 'gstin')} />
                  </Field>
                </div>
              </Block>
              <Block title="Where else we are" lead="Google joins the site to these profiles (sameAs). Only the ones you have." form={l} saved={doc.links} onSave={() => save('links')} busy={busy === 'links'}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['instagram', 'Instagram'],
                    ['facebook', 'Facebook'],
                    ['youtube', 'YouTube'],
                    ['googleBusiness', 'Google Business Profile'],
                    ['justdial', 'Justdial'],
                  ].map(([k, label]) => (
                    <Field key={k} id={`l-${k}`} label={label}>
                      <Input id={`l-${k}`} value={l[k] || ''} onChange={set('links', k)} inputMode="url" placeholder="https://…" />
                    </Field>
                  ))}
                </div>
              </Block>
              </>
            )}
            {tab === 'rules' && (
              <Block
                title={`Seller rulebook · v${doc.rules.version}`}
                lead={`The numbers in the Seller Agreement, effective ${doc.rules.effectiveFrom}. Saving a change publishes a new version - every seller reads and accepts it again before they can act.`}
                form={r}
                saved={doc.rules}
                onSave={() => save('rules')}
                busy={busy === 'rules'}
                confirm={{ title: 'Publish a new Seller Agreement?', description: `This becomes v${(() => { const [M, m] = String(doc.rules.version).split('.').map(Number); return m >= 9 ? `${M + 1}.0` : `${M}.${m + 1}`; })()}. Every seller sees the banner and must accept before packing another order. Do it when the change is real, not to tidy a number.`, label: 'Publish' }}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['dispatchDays', 'Dispatch within (working days)'],
                    ['returnWindowDays', 'Return window (days)'],
                    ['payoutAfterDeliveryDays', 'Payout after delivery (days)'],
                    ['disputeResponseHours', 'Dispute answer (hours)'],
                    ['cancelFreePer30Days', 'Free seller cancels / 30 days'],
                    ['cancelPenalty', 'Cancel charge after that (₹)'],
                    ['cancelRateReviewPct', 'Review above cancel rate (%)'],
                    ['defaultCommissionPct', 'Default commission (%)'],
                    // Fair Returns (plan §4.39)
                    ['damagedClaimHours', 'Damaged / wrong claim within (hours)'],
                    ['receiptCheckHours', 'Seller receipt check within (hours)'],
                    ['goodwillCapRupees', 'Goodwill refund cap (₹)'],
                    ['otpDeliveryAbove', 'OTP delivery at or above (₹)'],
                    ['unboxingVideoAbove', 'Unboxing video for wrong-item claims above (₹)'],
                    ['adminReviewAbove', 'Admin reviews every return above (₹)'],
                  ].map(([k, label]) => (
                    <Field key={k} id={`r-${k}`} label={label} hint={defaults?.rules?.[k] !== undefined && defaults.rules[k] !== r[k] ? `Default ${defaults.rules[k]}` : undefined}>
                      <Input id={`r-${k}`} type="number" value={r[k]} onChange={setNum('rules', k)} min={0} />
                    </Field>
                  ))}
                </div>
              </Block>
            )}
            {tab === 'switches' && (
              <Block title="Switches" lead="Enforced by the API, not only hidden on the page." form={s} saved={doc.shop} onSave={() => save('shop')} busy={busy === 'shop'}>
                {[
                  ['codEnabled', 'Cash on delivery', 'Off: checkout offers online payment only and the API refuses COD orders.'],
                  ['sameDayEnabled', 'Same-day delivery in Jaipur (Borzo)', 'Off: the option does not appear at checkout.'],
                  ['sellerSignupOpen', 'New seller applications', 'Off: /sell says applications are paused; the API refuses new ones.'],
                ].map(([k, label, hint]) => (
                  <div key={k} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <Label htmlFor={`s-${k}`} className="text-sm font-medium">
                        {label}
                      </Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                    </div>
                    <Switch id={`s-${k}`} checked={Boolean(s[k])} onCheckedChange={(v) => setForm({ ...form, shop: { ...s, [k]: v } })} />
                  </div>
                ))}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="freeShippingAbove" label="Free delivery on orders above (₹)" hint="0 = never. Enforced at checkout (basket at the price paid, before coupons) and the cart says how far the basket is from it. Product-level and seller-level free delivery still apply.">
                    <Input id="freeShippingAbove" type="number" min={0} value={s.freeShippingAbove} onChange={setNum('shop', 'freeShippingAbove')} />
                  </Field>
                  <Field id="shippingRate" label="Representative delivery charge (₹)" hint="What Google's feed and the product schema quote as the shipping cost.">
                    <Input id="shippingRate" type="number" min={0} value={s.shippingRate} onChange={setNum('shop', 'shippingRate')} />
                  </Field>
                </div>
              </Block>
            )}
            {tab === 'announcement' && (
              <Block title="Announcement bar" lead="One line above the header - a festival offer, a holiday notice. Off by default." form={a} saved={doc.announcement} onSave={() => save('announcement')} busy={busy === 'announcement'}>
                <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="ann" className="text-sm font-medium">
                      Show the bar
                    </Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">Appears within five minutes of saving.</p>
                  </div>
                  <Switch id="ann" checked={Boolean(a.enabled)} onCheckedChange={(v) => setForm({ ...form, announcement: { ...a, enabled: v } })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                  <Field id="annText" label="Text" hint={`${(a.text || '').length}/140`}>
                    <Input id="annText" value={a.text} onChange={set('announcement', 'text')} maxLength={140} placeholder="Diwali week: free delivery in Jaipur" />
                  </Field>
                  <Field id="annHref" label="Link (optional)">
                    <Input id="annHref" value={a.href} onChange={set('announcement', 'href')} placeholder="/shop?category=jewellery" />
                  </Field>
                  <Field id="annAud" label="Show to">
                    <select id="annAud" value={a.audience} onChange={set('announcement', 'audience')} className="h-10 rounded-md border bg-background px-3 text-sm">
                      <option value="everyone">Everyone</option>
                      <option value="sellers">Sellers only</option>
                    </select>
                  </Field>
                </div>
              </Block>
            )}
          </div>
        )}
      </PanelTabs>
    </>
  );
}
