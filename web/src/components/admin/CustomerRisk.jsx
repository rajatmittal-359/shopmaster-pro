'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

/**
 * One customer's standing (plan §4.39 D): the 180-day record the code
 * computes, and the consequence the admin sets - each step short of a
 * block, each with a reason the customer is shown.
 *
 *   none              nothing
 *   warn              a note on their account
 *   prepaid_only      COD refused at checkout
 *   returns_approval  every return waits for the admin's yes
 *
 * Flipkart moves a customer to prepaid-only after repeated COD refusals;
 * Amazon quietly limits returns. Ours says why, on the account.
 */
const LEVELS = [
  ['none', 'No restriction'],
  ['warn', 'Warned'],
  ['prepaid_only', 'Prepaid only (no COD)'],
  ['returns_approval', 'Returns need my approval'],
];

export default function CustomerRisk({ customer, onChange }) {
  const [data, setData] = useState(null);
  const [level, setLevel] = useState('none');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authedFetch(`/admin/customers/${customer._id}/risk`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLevel(d.user?.risk?.level || 'none');
        setReason(d.user?.risk?.reason || '');
      })
      .catch((e) => !cancelled && toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [customer._id]);

  const save = async () => {
    setBusy(true);
    try {
      const r = await authedFetch(`/admin/customers/${customer._id}/risk`, { method: 'PATCH', body: { level, reason } });
      toast.success(level === 'none' ? 'Restriction removed' : `Set to "${LEVELS.find((l) => l[0] === level)?.[1]}"`);
      onChange?.(r.risk);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p className="text-sm text-muted-foreground">Reading the record…</p>;
  const r = data.risk;
  const tone = r.level === 'high' ? 'text-destructive' : r.level === 'watch' ? 'text-amber-700' : 'text-emerald-700';
  return (
    <div className="space-y-3 text-sm">
      <p>
        <span className={`font-medium ${tone}`}>{r.level === 'high' ? 'High risk' : r.level === 'watch' ? 'Watch' : 'Clean'}</span>
        <span className="text-muted-foreground"> · last {r.windowDays} days: {r.orders} orders, {r.delivered} delivered, {r.returns} returns ({r.returnRate}%), {r.refused} refused, {r.disputes} disputes ({r.disputesLost} lost), {r.rto} undelivered, {r.emptyBox} wrong/empty claims{r.goodwill ? `, ${r.goodwill} goodwill refund` : ''}</span>
      </p>
      {r.signals.length > 0 && (
        <ul className="list-disc pl-5 text-muted-foreground">{r.signals.map((s) => <li key={s}>{s}</li>)}</ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {LEVELS.map(([v, label]) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 has-[:checked]:border-primary">
            <input type="radio" name={`risk-${customer._id}`} checked={level === v} onChange={() => setLevel(v)} />
            {label}
          </label>
        ))}
      </div>
      {level !== 'none' && (
        <div>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why - the customer sees this on their account and at checkout. e.g. 3 of 4 returns came back worn in August." />
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || (level !== 'none' && reason.trim().length < 5)}>Save</Button>
        {data.user?.risk?.setAt && <span className="self-center text-xs text-muted-foreground">Current: {LEVELS.find((l) => l[0] === data.user.risk.level)?.[1]} since {new Date(data.user.risk.setAt).toLocaleDateString('en-IN')}</span>}
      </div>
    </div>
  );
}
