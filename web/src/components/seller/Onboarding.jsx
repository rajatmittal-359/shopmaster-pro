'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { apiBase } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The first thing a new seller sees - and the only thing, until the shop can
 * actually trade.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Meesho's supplier onboarding is a wizard: one screen, one job, a step
 *   counter, no panel until it is done. Shopify's first-run Home is a setup
 *   guide with one step expanded at a time and a progress bar. Both because
 *   the same thing Rajat said: "ghuste hi samajh aa jaaye kahan jaana hai,
 *   kya karna hai, next kya hai." A dashboard of empty tiles says none of that.
 *
 * FOUR THINGS, IN ORDER, EACH ANSWERED HERE
 *   1 the rules (accept)  2 where the courier collects  3 where the money
 *   goes  4 the first product. Steps 2 and 3 are forms on this screen, not
 *   links to Settings - a link is a place to get lost. Step 4 opens the
 *   product form, which is a screen of its own, and comes back here to say
 *   "your shop is live". After that the panel is the panel.
 *
 * NO SKIP. Meesho does not allow one either: a shop without a pickup address
 * cannot ship, without a bank account cannot be paid, and a first product is
 * the point. Everything can be changed later in Settings and Payments.
 */
const STEPS = [
  { id: 'rules', title: 'The rules', why: 'Two minutes. Dispatch, cancellations, returns, payouts.' },
  { id: 'pickup', title: 'Where the courier collects', why: 'The rider is sent here. Without it nothing ships.' },
  { id: 'bank', title: 'Where the money goes', why: 'Paid 7 days after each delivery, once returns close.' },
  { id: 'product', title: 'Your first product', why: 'One photo is enough. The AI writes the rest.' },
];

const loadState = () =>
  Promise.all([
    authedFetch('/seller/settings'),
    authedFetch('/seller/payout-details').catch(() => null),
    authedFetch('/seller/analytics').catch(() => null),
    fetch(`${apiBase}/public/seller-rules`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([s, bank, analytics, rules]) => ({
    agreed: Boolean(s.settings?.agreement?.upToDate),
    pickupSet: Boolean(s.settings?.pickupAddress?.pincode),
    bankSet: Boolean(bank?.bankDetails?.accountNumber),
    productsTotal: analytics?.products?.total || 0,
    businessName: s.settings?.businessName,
    rules,
  }));

export default function Onboarding({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState(null); // { agreed, pickupSet, bankSet, productsTotal, rules }
  const [celebrated, setCelebrated] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('smp_onboarded') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    loadState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState({ agreed: true, pickupSet: true, bankSet: true, productsTotal: 1, failed: true });
      });
    // Re-check when the seller comes back from the product form.
  }, [pathname]);

  if (!state) {
    return (
      <div className="skeleton-in mx-auto max-w-xl space-y-4" aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const done = {
    rules: state.agreed,
    pickup: state.pickupSet,
    bank: state.bankSet,
    product: state.productsTotal > 0,
  };
  const pending = STEPS.filter((s) => !done[s.id]);

  // A shop that has already listed something is not new: it gets the panel,
  // and Home's setup guide nags about what is still missing. The wizard is
  // for the first day only. The product form is the one page step 4 needs.
  if (pending.length === 0 && celebrated) return children;
  if (state.productsTotal > 0 && (pending.length > 0 || celebrated)) return children;
  if (pathname.startsWith('/seller/products/new')) return children;

  if (pending.length === 0) {
    return (
      <Done
        businessName={state.businessName}
        onGo={() => {
          try {
            localStorage.setItem('smp_onboarded', '1');
          } catch {}
          setCelebrated(true);
          router.push('/seller');
        }}
      />
    );
  }

  const current = pending[0];
  const index = STEPS.findIndex((s) => s.id === current.id);
  const refresh = () => loadState().then(setState);

  return (
    <div className="mx-auto max-w-xl">
      <ol className="mb-6 flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`grid size-6 place-items-center rounded-full text-xs tabular-nums ${
                done[s.id]
                  ? 'bg-primary text-primary-foreground'
                  : i === index
                    ? 'border-2 border-primary text-brand-ink'
                    : 'border text-muted-foreground'
              }`}
              aria-current={i === index ? 'step' : undefined}
            >
              {done[s.id] ? <Check className="size-3.5" /> : i + 1}
            </span>
            {i < STEPS.length - 1 && <span className={`h-px w-6 sm:w-10 ${done[s.id] ? 'bg-primary' : 'bg-border'}`} />}
          </li>
        ))}
      </ol>

      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Step {index + 1} of {STEPS.length}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{current.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{current.why}</p>

      <div className="mt-6 rounded-xl border bg-card p-5">
        {current.id === 'rules' && <RulesStep rules={state.rules} onDone={refresh} />}
        {current.id === 'pickup' && <PickupStep onDone={refresh} />}
        {current.id === 'bank' && <BankStep onDone={refresh} />}
        {current.id === 'product' && <ProductStep />}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Everything here can be changed later in Settings and Payments.
      </p>
    </div>
  );
}

/* ---------------- steps ---------------- */

function RulesStep({ rules, onDone }) {
  const [busy, setBusy] = useState(false);
  const r = rules || {};
  const lines = [
    `Hand a paid order to the courier within ${r.dispatchDays ?? 2} business days.`,
    `Cancel an order you accepted: ${r.cancelFreePer30Days ?? 2} free a month, then ₹${r.cancelPenalty ?? 50} from your payout.`,
    `Customers can return within ${r.returnWindowDays ?? 7} days; refuse only for the reasons listed, and the platform decides disputes.`,
    `You are paid ${r.payoutAfterDeliveryDays ?? 7} days after each delivery. Commission ${r.defaultCommissionPct ?? 8}%, no GST added, no other fees.`,
    'Honest photos and words. Imitation jewellery is called imitation.',
  ];
  const accept = async () => {
    setBusy(true);
    try {
      await authedFetch('/seller/agreement/accept', { method: 'POST', body: { agreementVersion: r.version } });
      toast.success('Agreed');
      await onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ul className="space-y-2 text-sm">
        {lines.map((l) => (
          <li key={l} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-ink" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">
        That is the short version.{' '}
        <Link href="/selling-policy" target="_blank" rel="noopener" className="text-brand-ink underline">
          Read the full Seller Agreement (v{r.version || '1.0'})
        </Link>
        .
      </p>
      <Button className="mt-4" size="lg" onClick={accept} disabled={busy || !r.version}>
        {busy ? 'Saving…' : 'I have read it and agree'}
      </Button>
    </>
  );
}

function Field({ id, label, children, className = '' }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PickupStep({ onDone }) {
  const [a, setA] = useState({ contactName: '', phone: '', address1: '', address2: '', city: '', state: '', pincode: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setA({ ...a, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authedFetch('/seller/settings', { method: 'PATCH', body: { pickupAddress: a } });
      toast.success('Pickup address saved');
      await onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ob-name" label="Contact name">
          <Input id="ob-name" required autoComplete="name" value={a.contactName} onChange={set('contactName')} />
        </Field>
        <Field id="ob-phone" label="Phone">
          <Input id="ob-phone" required type="tel" inputMode="tel" autoComplete="tel" value={a.phone} onChange={set('phone')} />
        </Field>
      </div>
      <Field id="ob-a1" label="Address">
        <Input id="ob-a1" required autoComplete="address-line1" value={a.address1} onChange={set('address1')} />
      </Field>
      <Field id="ob-a2" label="Landmark (optional)">
        <Input id="ob-a2" autoComplete="address-line2" value={a.address2} onChange={set('address2')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="ob-city" label="City">
          <Input id="ob-city" required autoComplete="address-level2" value={a.city} onChange={set('city')} />
        </Field>
        <Field id="ob-state" label="State">
          <Input id="ob-state" required autoComplete="address-level1" value={a.state} onChange={set('state')} />
        </Field>
        <Field id="ob-pin" label="PIN code">
          <Input
            id="ob-pin"
            required
            inputMode="numeric"
            autoComplete="postal-code"
            value={a.pincode}
            onChange={(e) => setA({ ...a, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Saving…' : 'Save and continue'}
        </Button>
      </div>
    </form>
  );
}

function BankStep({ onDone }) {
  const [f, setF] = useState({ accountHolderName: '', accountNumber: '', ifscCode: '', gstNumber: '' });
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = again.length > 0 && again !== f.accountNumber;
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authedFetch('/seller/payout-details', { method: 'PATCH', body: f });
      toast.success('Bank account saved');
      await onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ob-holder" label="Name on the account">
          <Input id="ob-holder" required value={f.accountHolderName} onChange={(e) => setF({ ...f, accountHolderName: e.target.value })} />
        </Field>
        <Field id="ob-ifsc" label="IFSC">
          <Input
            id="ob-ifsc"
            required
            maxLength={11}
            className="uppercase"
            value={f.ifscCode}
            onChange={(e) => setF({ ...f, ifscCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
          />
        </Field>
        <Field id="ob-acct" label="Account number">
          <Input id="ob-acct" required inputMode="numeric" className="tabular-nums" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value.replace(/\D/g, '') })} />
        </Field>
        <Field id="ob-acct2" label="Account number, again">
          <Input id="ob-acct2" required inputMode="numeric" className="tabular-nums" aria-invalid={mismatch} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        {mismatch ? 'The two numbers differ - check your passbook.' : 'A transfer to a wrong account cannot be pulled back.'}
      </p>
      <Field id="ob-gst" label="GSTIN (optional)">
        <Input id="ob-gst" maxLength={15} className="uppercase sm:max-w-xs" value={f.gstNumber} onChange={(e) => setF({ ...f, gstNumber: e.target.value.toUpperCase() })} />
      </Field>
      <div>
        <Button type="submit" size="lg" disabled={busy || mismatch || !again}>
          {busy ? 'Saving…' : 'Save and continue'}
        </Button>
      </div>
    </form>
  );
}

function ProductStep() {
  return (
    <>
      <ol className="space-y-2 text-sm">
        <li className="flex gap-2"><span className="w-5 shrink-0 text-brand-ink">1.</span>Add a photo - your phone camera is fine.</li>
        <li className="flex gap-2"><span className="w-5 shrink-0 text-brand-ink">2.</span>Press <strong className="mx-1">Write it for me</strong> - the AI fills the title, description and details. Fix what is wrong.</li>
        <li className="flex gap-2"><span className="w-5 shrink-0 text-brand-ink">3.</span>Price, stock, and <strong className="mx-1">List it</strong>.</li>
      </ol>
      <Button className="mt-4" size="lg" nativeButton={false} render={<Link href="/seller/products/new" />}>
        Add your first product
      </Button>
    </>
  );
}

function Done({ businessName, onGo }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/shop`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy - the address is /shop on this site.');
    }
  };
  return (
    <div className="mx-auto max-w-xl text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary text-primary-foreground">
        <Check className="size-6" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{businessName || 'Your shop'} is live</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your first customers are people who already know you. Send them the link, then watch Orders.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="outline" onClick={copy}>
          <Copy className="size-4" /> Copy the shop link
        </Button>
        <Button onClick={onGo}>Go to your panel</Button>
      </div>
    </div>
  );
}
