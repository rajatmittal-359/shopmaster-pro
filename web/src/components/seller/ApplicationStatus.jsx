'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, Loader2, MessageSquareWarning, XCircle } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { checkPan, checkGstin, checkEnrolment } from '@/lib/kyc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Where the application stands, in the applicant's words (plan 2.40).
 *
 *   submitted   "with us - a person reads it, usually within a day"
 *   needs_info  the one thing the admin asked for, and the fields to fix it
 *   rejected    the reason, and the same fields - the door stays open
 *   approved    the dashboard
 *
 * Amazon shows "verification pending" and a list of what is missing; Flipkart
 * shows the step that failed. Ours shows the sentence the admin typed. The
 * fields here are the same ones the apply form has; saving puts the
 * application back in the queue and rings the admin.
 */
const WORDS = {
  submitted: { icon: Clock, tone: 'text-brand-ink', title: 'Your application is with us', body: 'A person reads it - usually within a day. You can open the dashboard now; nothing of yours is public until it is approved.' },
  needs_info: { icon: MessageSquareWarning, tone: 'text-amber-700 dark:text-amber-300', title: 'One thing before approval', body: null },
  rejected: { icon: XCircle, tone: 'text-destructive', title: 'Not approved this time', body: null },
  approved: { icon: Check, tone: 'text-emerald-700 dark:text-emerald-300', title: 'This account sells on ShopMaster Pro', body: 'Your dashboard has your orders, products and earnings.' },
  suspended: { icon: XCircle, tone: 'text-destructive', title: 'This shop is paused', body: 'An admin has suspended it. Write to us from Help if you think that is wrong.' },
};

export default function ApplicationStatus({ approved, justApplied, onDashboard = false }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/application')
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setForm({ ...d.application, businessName: d.businessName });
      })
      .catch(() => !cancelled && setData({ state: approved ? 'approved' : 'submitted', application: {} }));
    return () => {
      cancelled = true;
    };
  }, [approved]);

  const stateKey = data?.state || (approved ? 'approved' : 'submitted');
  const w = WORDS[stateKey] || WORDS.submitted;
  const Icon = w.icon;
  const editable = stateKey === 'needs_info' || stateKey === 'rejected';

  const save = async (e) => {
    e.preventDefault();
    setState({ status: 'saving' });
    try {
      const r = await authedFetch('/seller/application', { method: 'PATCH', body: { businessName: form.businessName, legalName: form.legalName, pan: form.pan, gstMode: form.gstMode, gstin: form.gstMode === 'gstin' ? form.gstin : '', enrolmentNumber: form.gstMode === 'enrolment' ? form.enrolmentNumber : '', phone: form.phone, city: form.city, pincode: form.pincode, sells: form.sells, shopPhotoDataUrl: form.shopPhotoDataUrl || '' } });
      setData((d) => ({ ...d, state: r.state || 'submitted', infoRequested: null }));
      setState({ status: 'saved' });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const pan = form ? checkPan(form.pan || '') : null;
  const gst = form?.gstMode === 'gstin' ? checkGstin(form.gstin || '') : form?.gstMode === 'enrolment' ? checkEnrolment(form.enrolmentNumber || '') : null;

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-xl border border-border p-4">
        <p className={`flex items-center gap-2 font-medium ${w.tone}`}>
          <Icon className="size-4" /> {w.title}
        </p>
        {stateKey === 'needs_info' && data?.infoRequested?.reason && (
          <p className="mt-2 rounded-lg bg-amber-500/10 p-3 text-sm">&ldquo;{data.infoRequested.reason}&rdquo;</p>
        )}
        {stateKey === 'rejected' && (
          <p className="mt-2 text-sm text-muted-foreground">{data?.rejectReason ? `"${data.rejectReason}" - ` : ''}Fix what you can below and send it again; a person reads it afresh.</p>
        )}
        {w.body && <p className="mt-1 text-sm text-muted-foreground">{justApplied && stateKey === 'submitted' ? 'Thank you - that is with us now. ' : ''}{w.body}</p>}
        {!onDashboard && (stateKey === 'approved' || stateKey === 'submitted') && (
          <Button className="mt-3" nativeButton={false} render={<Link href="/seller" />}>
            Open the seller dashboard
          </Button>
        )}
      </div>

      {editable && form && (
        <form onSubmit={save} className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm font-medium">Update the application</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Shop name<Input className="mt-1" value={form.businessName || ''} onChange={(e) => setForm({ ...form, businessName: e.target.value })} /></label>
            <label className="text-sm">Legal name<Input className="mt-1" value={form.legalName || ''} onChange={(e) => setForm({ ...form, legalName: e.target.value })} /></label>
            <label className="text-sm">PAN<Input className="mt-1 font-mono" value={form.pan || ''} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase().slice(0, 10) })} />{pan?.reason && <span className="text-xs text-destructive">{pan.reason}</span>}</label>
            <label className="text-sm">GST
              <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.gstMode || 'none'} onChange={(e) => setForm({ ...form, gstMode: e.target.value })}>
                <option value="gstin">GSTIN</option>
                <option value="enrolment">Enrolment number (no GSTIN)</option>
                <option value="none">Neither yet</option>
              </select>
            </label>
            {form.gstMode === 'gstin' && <label className="text-sm sm:col-span-2">GSTIN<Input className="mt-1 font-mono" value={form.gstin || ''} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase().slice(0, 15) })} />{gst?.reason && <span className="text-xs text-destructive">{gst.reason}</span>}</label>}
            {form.gstMode === 'enrolment' && <label className="text-sm sm:col-span-2">Enrolment number<Input className="mt-1 font-mono" value={form.enrolmentNumber || ''} onChange={(e) => setForm({ ...form, enrolmentNumber: e.target.value.toUpperCase().slice(0, 15) })} />{gst?.reason && <span className="text-xs text-destructive">{gst.reason}</span>}</label>}
            <label className="text-sm">City<Input className="mt-1" value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label className="text-sm">PIN code<Input className="mt-1" inputMode="numeric" value={form.pincode || ''} onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} /></label>
            <label className="text-sm">Mobile<Input className="mt-1" inputMode="tel" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="text-sm">Shop photo
              <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-xs" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setForm((x) => ({ ...x, shopPhotoDataUrl: String(r.result) })); r.readAsDataURL(f); }} />
              {form.shopPhoto && !form.shopPhotoDataUrl && <span className="text-xs text-muted-foreground">One is on file; choose another to replace it.</span>}
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={state.status === 'saving'}>{state.status === 'saving' ? <><Loader2 className="size-4 animate-spin" /> Sending…</> : 'Send it again'}</Button>
            <span aria-live="polite" className="text-sm">
              {state.status === 'saved' && <span className="text-emerald-700 dark:text-emerald-300">Back with the admin.</span>}
              {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
            </span>
          </div>
        </form>
      )}
    </div>
  );
}
