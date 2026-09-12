'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

/**
 * A seller's money, and where it has got to.
 *
 * FOUR NUMBERS, NOT ONE
 *   Paid out, ready for the next transfer, still clearing, and commission
 *   charged. "Earnings: Rs 12,400" answers nothing a seller actually asks -
 *   which is "when do I get it, and why is it less than I sold".
 *
 * THE RATE IS SHOWN, NOT ONLY THE RUPEES
 *   The amount taken tells them what has happened; the rate tells them what
 *   will. It is also the one number an admin can change, so a seller who
 *   cannot see it is being asked to trust a figure they cannot check.
 *
 * BANK DETAILS ARE MASKED ONCE SAVED
 *   The API returns only the last four digits. This screen never asks for them
 *   again to "confirm" - re-typing an account number is how a digit gets
 *   changed by accident, and a payout to a wrong account is gone.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const when = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';

export default function Earnings() {
  const [data, setData] = useState(null);
  const [bank, setBank] = useState(null);
  const [form, setForm] = useState({ accountHolderName: '', accountNumber: '', ifscCode: '', gstNumber: '' });
  const [editing, setEditing] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState('');
  const [state, setState] = useState({ status: 'loading' });

  const load = async () => {
    const [earnings, details] = await Promise.all([
      authedFetch('/seller/earnings'),
      authedFetch('/seller/payout-details'),
    ]);
    setData(earnings);
    setBank(details);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [earnings, details] = await Promise.all([
          authedFetch('/seller/earnings'),
          authedFetch('/seller/payout-details'),
        ]);
        if (cancelled) return;
        setData(earnings);
        setBank(details);
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
      await authedFetch('/seller/payout-details', { method: 'PATCH', body: form });
      setEditing(false);
      setConfirmAccount('');
      await load();
      toast.success('Bank account saved', { description: 'Payouts go here from the next settlement.' });
    } catch (err) {
      setState({ status: 'idle' });
      toast.error(err.message);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="skeleton-in space-y-6" aria-busy="true" aria-label="Loading earnings">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (!data) return <p className="text-destructive">{state.message}</p>;

  const e = data.earnings || {};
  const cards = [
    ['Paid out', money(e.paidOut), 'Already transferred to you'],
    ['Ready for the next payout', money(e.readyForPayout), 'Delivered and past the return window'],
    ['Still clearing', money(e.pendingClearance), `Delivered less than ${data.returnWindowDays} days ago, or not delivered yet`],
    ['Commission charged', money(e.commissionCharged), `Your rate is ${e.commissionRate ?? '—'}%`],
  ];

  return (
    <div className="space-y-8">
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, note]) => (
          <div key={label} className="rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border p-4">
        <h2 className="font-semibold">Where the money goes</h2>

        {!editing && bank?.bankDetails?.accountNumber ? (
          <div className="mt-3 text-sm">
            <p>{bank.bankDetails.accountHolderName}</p>
            <p className="text-muted-foreground">
              {bank.bankDetails.accountNumber} · {bank.bankDetails.ifscCode}
            </p>
            {bank.gstNumber && <p className="text-muted-foreground">GSTIN {bank.gstNumber}</p>}
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
              Change these
            </Button>
          </div>
        ) : !editing ? (
          <div className="mt-3">
            <p className="text-sm text-destructive">
              No bank account on file. Nothing can be transferred until there is one.
            </p>
            <Button size="sm" className="mt-3" onClick={() => setEditing(true)}>
              Add the account
            </Button>
          </div>
        ) : (
          <form onSubmit={save} className="mt-3 grid gap-5 sm:grid-cols-2">
            {/* Labels above, hints below (Baymard) - on the one form where a
                typo sends money to a stranger. The account number is typed
                twice, as every Indian bank's own beneficiary form asks. */}
            <div>
              <Label htmlFor="acct-name">Name on the account</Label>
              <Input
                id="acct-name"
                className="mt-1.5"
                required
                autoComplete="name"
                value={form.accountHolderName}
                onChange={(el) => setForm({ ...form, accountHolderName: el.target.value })}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">Exactly as the bank has it.</p>
            </div>
            <div>
              <Label htmlFor="acct-ifsc">IFSC</Label>
              <Input
                id="acct-ifsc"
                className="mt-1.5 uppercase"
                required
                maxLength={11}
                value={form.ifscCode}
                onChange={(el) => setForm({ ...form, ifscCode: el.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">11 characters, printed on the cheque book and in the banking app.</p>
            </div>
            <div>
              <Label htmlFor="acct-no">Account number</Label>
              <Input
                id="acct-no"
                className="mt-1.5 tabular-nums"
                required
                inputMode="numeric"
                value={form.accountNumber}
                onChange={(el) => setForm({ ...form, accountNumber: el.target.value.replace(/\D/g, '') })}
              />
            </div>
            <div>
              <Label htmlFor="acct-no-2">Account number, again</Label>
              <Input
                id="acct-no-2"
                className="mt-1.5 tabular-nums"
                required
                inputMode="numeric"
                value={confirmAccount}
                onChange={(el) => setConfirmAccount(el.target.value.replace(/\D/g, ''))}
                aria-invalid={confirmAccount.length > 0 && confirmAccount !== form.accountNumber}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {confirmAccount && confirmAccount !== form.accountNumber
                  ? 'The two numbers differ - check your passbook.'
                  : 'A transfer to a wrong account cannot be pulled back.'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="acct-gst">GSTIN <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                id="acct-gst"
                className="mt-1.5 uppercase sm:max-w-xs"
                maxLength={15}
                value={form.gstNumber}
                onChange={(el) => setForm({ ...form, gstNumber: el.target.value.toUpperCase() })}
              />
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={state.status === 'working' || confirmAccount !== form.accountNumber}>
                {state.status === 'working' ? 'Saving…' : 'Save the account'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>

      <section>
        <h2 className="font-semibold">Payouts</h2>
        {(data.payouts || []).length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            None yet. The first one comes once something you have sold clears its
            return window.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
            {data.payouts.map((payout) => (
              <li key={payout._id} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
                <span>
                  {payout.payoutNumber}
                  <span className="block text-xs text-muted-foreground">
                    {payout.itemCount} item(s) · {payout.status === 'paid' ? `paid ${when(payout.paidAt || payout.createdAt)}` : when(payout.createdAt)}
                    {payout.reference ? ` · ref ${payout.reference}` : ''}
                  </span>
                </span>
                <span className="text-right">
                  {money(payout.netPayable)}
                  {/* A deduction the seller cannot see is a payout they will
                      dispute. Amazon's statement shows the minus on the line. */}
                  {payout.deductions > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      {money(payout.netPayable + payout.deductions)} − {money(payout.deductions)} cancellation charge
                    </span>
                  )}
                  <span className="block text-xs capitalize text-muted-foreground">
                    {payout.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
