'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, Check, ChevronLeft, Loader2 } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { useSession, setCapabilities } from '@/lib/session';
import { checkPan, checkGstin, checkEnrolment } from '@/lib/kyc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AgreementConsent from '@/components/seller/AgreementConsent';
import ApplicationStatus from '@/components/seller/ApplicationStatus';
import Turnstile, { turnstileEnabled } from '@/components/common/Turnstile';

/**
 * Adding selling to the account somebody already has.
 *
 * WHY THIS IS NOT A SECOND SIGN-UP
 *   It used to be: selling was chosen at registration and written into `role`,
 *   so a shopper who decided to sell had to make a second account with a
 *   second email - two order histories, two passwords, one person. Etsy's own
 *   wording is the test we held ourselves to: "You'll use this account to run
 *   your shop and to buy from other makers on Etsy."
 *
 * THE THREE STEPS (plan 2.40, 15 Sep 2026)
 *   What Amazon, Flipkart and Meesho ask, sized for a Jaipur shop and split
 *   the way Flipkart's 8-step hub is - one thing per screen, checked as it
 *   is typed:
 *     1  The shop     name as on the board, what it sells, city + PIN, phone,
 *                     a photo of the board (our video KYC)
 *     2  Identity     PAN; then GSTIN, or the GST portal's enrolment number
 *                     (no GSTIN: within the state, under ₹40 lakh), or
 *                     "not yet" - each with the one line on why
 *     3  Agreement    the rulebook, then Apply
 *   Bank details are NOT here: they are needed before the first payout, not
 *   before approval, and Payments already asks for them. Every field says
 *   why it is asked - the law, the courier, the payout - because a form that
 *   explains itself is filled; one that does not is abandoned.
 *
 * WHAT IT PROMISES, AND WHAT IT DOES NOT
 *   It creates the application. An admin reads it - usually within a day -
 *   and nothing of theirs is public until then, which the button says.
 */
const STEPS = ['The shop', 'Identity', 'Agreement'];

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read the photo'));
    r.readAsDataURL(file);
  });

function Field({ id, label, why, children, status }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {status}
      </div>
      <div className="mt-1">{children}</div>
      {why && <p className="mt-1 text-xs text-muted-foreground">{why}</p>}
    </div>
  );
}

/** ✓ / the reason, beside the field, as the applicant types. */
function Check_({ result }) {
  if (!result || (!result.ok && !result.reason)) return null;
  return result.ok ? (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"><Check className="size-3.5" /> {result.state ? result.state : 'Looks right'}</span>
  ) : (
    <span className="text-xs text-destructive">{result.reason}</span>
  );
}

export default function ApplyToSell() {
  const router = useRouter();
  const { signedIn, canSell, capabilities } = useSession();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ businessName: '', legalName: '', sells: '', city: '', pincode: '', phone: '', pan: '', gstMode: '', gstin: '', enrolmentNumber: '' });
  const [photo, setPhoto] = useState(null); // { dataUrl, name }
  const [agreed, setAgreed] = useState(false);
  // The bot check's token (plan 2.28), rendered on the last step only.
  const [turnstileToken, setTurnstileToken] = useState('');
  const [agreementVersion, setAgreementVersion] = useState(null);
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    if (!signedIn || capabilities) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const me = await authedFetch('/auth/me');
        if (!cancelled) setCapabilities(me.capabilities);
      } catch {
        // Nothing to do - the form below still works, and the API is the judge.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, capabilities]);

  if (!signedIn) {
    return (
      <div className="flex flex-wrap gap-3">
        <Button size="lg" nativeButton={false} render={<Link href="/register?sell=1" />}>
          Create an account and apply
        </Button>
        <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/login?next=%2Fsell" />}>
          I already have an account
        </Button>
      </div>
    );
  }

  // Already applied (or already selling): where it stands, and what to fix if asked.
  if (canSell || state.status === 'applied') return <ApplicationStatus approved={Boolean(capabilities?.sellerApproved)} justApplied={state.status === 'applied'} />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pan = checkPan(form.pan);
  const gstin = form.gstMode === 'gstin' ? checkGstin(form.gstin) : null;
  const enrol = form.gstMode === 'enrolment' ? checkEnrolment(form.enrolmentNumber) : null;
  const panMismatch = pan.ok && ((gstin?.ok && gstin.pan !== pan.value) || (enrol?.ok && enrol.pan !== pan.value));

  const step1Ok = form.businessName.trim().length >= 2 && /^\d{6}$/.test(form.pincode.replace(/\D/g, '')) && form.city.trim().length >= 2 && /^(\+91)?[6-9]\d{9}$/.test(form.phone.replace(/[^\d+]/g, ''));
  const step2Ok = pan.ok && !panMismatch && (form.gstMode === 'none' || (form.gstMode === 'gstin' && gstin?.ok) || (form.gstMode === 'enrolment' && enrol?.ok));

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending' });
    try {
      await authedFetch('/auth/become-seller', {
        method: 'POST',
        body: {
          businessName: form.businessName.trim(),
          legalName: form.legalName.trim() || form.businessName.trim(),
          sells: form.sells,
          city: form.city,
          pincode: form.pincode,
          phone: form.phone,
          pan: form.pan,
          gstMode: form.gstMode,
          gstin: form.gstMode === 'gstin' ? form.gstin : '',
          enrolmentNumber: form.gstMode === 'enrolment' ? form.enrolmentNumber : '',
          shopPhotoDataUrl: photo?.dataUrl || '',
          acceptedSellerAgreement: agreed,
          agreementVersion,
          turnstileToken,
        },
      });
      // Re-read rather than assume: the answer that matters is the one the
      // server will give every other page.
      const me = await authedFetch('/auth/me');
      setCapabilities(me.capabilities);
      setState({ status: 'applied' });
      router.refresh();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  return (
    <form onSubmit={submit} className="max-w-xl space-y-5 rounded-xl border border-border p-4 sm:p-5">
      {/* Where you are - Flipkart's hub shows the step count; people finish what they can see the end of. */}
      <ol className="flex items-center gap-2 text-xs" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-1.5 ${i === step ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            <span className={`grid size-5 place-items-center rounded-full text-[0.65rem] ${i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-brand-ink text-white' : 'bg-muted'}`}>{i < step ? <Check className="size-3" /> : i + 1}</span>
            {label}
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <Field id="businessName" label="Shop name, as on your board" why="Customers see this beside your products. If it is only you, your own name is fine.">
            <Input id="businessName" required minLength={2} value={form.businessName} onChange={set('businessName')} autoFocus />
          </Field>
          <Field id="sells" label="What do you sell?" why="One line - it helps us put you in the right categories.">
            <Input id="sells" value={form.sells} onChange={set('sells')} placeholder="Kundan and meenakari jewellery, handmade" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field id="city" label="City" why="Jaipur is our home; other cities are welcome.">
              <Input id="city" required value={form.city} onChange={set('city')} placeholder="Jaipur" />
            </Field>
            <Field id="pincode" label="PIN code" why="Where the courier collects.">
              <Input id="pincode" required inputMode="numeric" value={form.pincode} onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))} />
            </Field>
          </div>
          <Field id="phone" label="Mobile number" why="For the courier and for us - never shown to customers.">
            <Input id="phone" required inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="98765 43210" />
          </Field>
          <Field id="shopPhoto" label="A photo of your shop or workshop" why="The board, the counter, or where you make things - a person looks at it, the way Amazon asks to see the board on a video call. Optional, but it is what gets a new shop approved on the first look.">
            <label htmlFor="shopPhoto" className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm hover:bg-accent/40">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.dataUrl} alt="" className="size-14 rounded-md object-cover" />
              ) : (
                <span className="grid size-14 place-items-center rounded-md bg-muted text-muted-foreground"><Camera className="size-5" /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{photo ? photo.name : 'Add a photo'}</span>
                <span className="block text-xs text-muted-foreground">JPEG or PNG, under 5 MB. {photo ? 'Tap to change.' : 'Take it now on your phone.'}</span>
              </span>
              <input id="shopPhoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5 * 1024 * 1024) { setState({ status: 'error', message: 'That photo is over 5 MB - take a smaller one.' }); return; } setPhoto({ dataUrl: await fileToDataUrl(f), name: f.name }); setState({ status: 'idle' }); }} />
            </label>
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Field id="legalName" label="Legal name of the business" why="The name on your PAN or GST - shown as the seller of record on invoices and your shop page, as the law asks. Leave it if it is the same as the shop name.">
            <Input id="legalName" value={form.legalName} onChange={set('legalName')} placeholder={form.businessName || 'Same as the shop name'} />
          </Field>
          <Field id="pan" label="PAN" why="Every marketplace in India asks for it - it is how a seller is identified for tax. Yours or the business's. Never shown publicly." status={<Check_ result={form.pan.length >= 10 ? pan : null} />}>
            <Input id="pan" required value={form.pan} onChange={(e) => setForm((f) => ({ ...f, pan: e.target.value.toUpperCase().slice(0, 10) }))} placeholder="ABCPD1234E" className="font-mono tracking-wider" />
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">GST</legend>
            <p className="mb-2 text-xs text-muted-foreground">Since October 2023 a shop can sell online without a GSTIN if it sells within its own state and under ₹40 lakh a year - it needs a free enrolment number from the GST portal instead.</p>
            <div className="grid gap-2">
              {[
                ['gstin', 'I have a GSTIN', 'Sell anywhere in India.'],
                ['enrolment', 'No GSTIN - I have the GST enrolment number', 'Sell within your state. GST portal → Services → User Services → "Apply as a supplier to e-commerce operators" (10 minutes, free).'],
                ['none', 'Neither yet', 'You can still apply; you will sell within your state and we will remind you about the enrolment number before the first payout.'],
              ].map(([value, label, note]) => (
                <label key={value} className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-brand-ink">
                  <input type="radio" name="gstMode" value={value} checked={form.gstMode === value} onChange={() => setForm((f) => ({ ...f, gstMode: value }))} className="mt-1" />
                  <span>
                    <strong className="font-medium">{label}</strong>
                    <span className="block text-xs text-muted-foreground">{note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {form.gstMode === 'gstin' && (
            <Field id="gstin" label="GSTIN" why="15 characters from your GST certificate. We check the digit and the state as you type." status={<Check_ result={form.gstin.length >= 15 ? gstin : null} />}>
              <Input id="gstin" required value={form.gstin} onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 15) }))} placeholder="08ABCPD1234E1Z5" className="font-mono tracking-wider" />
            </Field>
          )}
          {form.gstMode === 'enrolment' && (
            <Field id="enrolmentNumber" label="GST enrolment number" why="From the GST portal's acknowledgement - 15 characters, your state code first." status={<Check_ result={form.enrolmentNumber.length >= 15 ? enrol : null} />}>
              <Input id="enrolmentNumber" required value={form.enrolmentNumber} onChange={(e) => setForm((f) => ({ ...f, enrolmentNumber: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 15) }))} className="font-mono tracking-wider" />
            </Field>
          )}
          {panMismatch && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              The {form.gstMode === 'gstin' ? 'GSTIN' : 'enrolment number'} carries PAN <span className="font-mono">{(gstin || enrol).pan}</span>, not <span className="font-mono">{pan.value}</span>. Type the PAN the GST was taken on - that is the one the invoice will carry.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <dl className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Shop</dt><dd className="font-medium">{form.businessName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Legal name</dt><dd className="font-medium">{form.legalName || form.businessName}</dd></div>
            <div><dt className="text-xs text-muted-foreground">City</dt><dd className="font-medium">{form.city} {form.pincode}</dd></div>
            <div><dt className="text-xs text-muted-foreground">PAN</dt><dd className="font-mono">{pan.value}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">GST</dt><dd className="font-medium">{form.gstMode === 'gstin' ? `${gstin.value} · ${gstin.state}` : form.gstMode === 'enrolment' ? `Enrolment ${enrol.value} · ${enrol.state} only` : 'Not yet - selling within the state'}</dd></div>
          </dl>
          <AgreementConsent checked={agreed} onChange={setAgreed} onVersion={setAgreementVersion} />
          <Turnstile action="apply" onToken={setTurnstileToken} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {step > 0 && (
          <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
            <ChevronLeft className="size-4" /> Back
          </Button>
        )}
        {step < 2 ? (
          <Button type="button" size="lg" disabled={step === 0 ? !step1Ok : !step2Ok} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        ) : (
          <Button type="submit" size="lg" disabled={state.status === 'sending' || !agreed || (turnstileEnabled() && !turnstileToken)}>
            {state.status === 'sending' ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : 'Apply to sell'}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Step {step + 1} of 3</span>
      </div>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <p className="text-xs text-muted-foreground">
        A person reads every application - usually within a day. You keep your cart and your orders; selling is added to this account, not instead of it. Bank details come later, under Payments, before your first payout.
      </p>
    </form>
  );
}
