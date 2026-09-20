'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Edit a shop's public details on its behalf (plan 2.42, 15 Sep 2026).
 *
 * The commonest support call a marketplace gets is "my address / link /
 * story is wrong, fix it" - Sharetribe's Console, VTEX and Webkul's "login
 * as vendor" all give the operator this door. Ours is narrower on purpose:
 * the same fields and rules as the seller's own Settings (one function,
 * `applyShopSettings`), never the bank account, a note the seller reads, and
 * a bell to the seller naming each field that changed. The last edits are
 * listed here, so the admin sees what was already done.
 */
const LINKS = [['instagram', 'Instagram'], ['googleBusiness', 'Google Business Profile'], ['facebook', 'Facebook'], ['youtube', 'YouTube'], ['website', 'Website']];

export default function EditShopDialog({ seller, open, onOpenChange, onSaved }) {
  const [form, setForm] = useState(null);
  const [edits, setEdits] = useState([]);
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    if (!open || !seller) return undefined;
    let cancelled = false;
    // Reset inside the promise chain, never synchronously in the effect body (house rule).
    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setForm(null);
        setState({ status: 'idle' });
        return authedFetch(`/admin/sellers/${seller._id}/shop`);
      })
      .then((d) => {
        if (cancelled || !d) return;
        setForm({ ...d.shop, note: '', shiprocketNickname: d.shop.pickupAddress?.shiprocketNickname || '', pickupAddress: { contactName: '', address1: '', address2: '', city: '', state: '', pincode: '', phone: '', ...(d.shop.pickupAddress || {}) } });
        setEdits(d.adminEdits || []);
      })
      .catch((err) => !cancelled && setState({ status: 'error', message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [open, seller]);

  const save = async (e) => {
    e.preventDefault();
    setState({ status: 'saving' });
    try {
      const pa = form.pickupAddress;
      const hasPickup = ['contactName', 'address1', 'city', 'state', 'pincode', 'phone'].some((k) => String(pa[k] || '').trim());
      const r = await authedFetch(`/admin/sellers/${seller._id}/shop`, {
        method: 'PATCH',
        body: { about: form.about, links: form.links, showLocation: form.showLocation, offersFreeShipping: form.offersFreeShipping, aiUnlimited: form.aiUnlimited, shiprocketNickname: form.shiprocketNickname, ...(hasPickup ? { pickupAddress: pa } : {}), note: form.note },
      });
      setState({ status: 'saved', message: r.message });
      onSaved?.();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const setPa = (k) => (e) => setForm((f) => ({ ...f, pickupAddress: { ...f.pickupAddress, [k]: e.target.value } }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {seller?.businessName} on their behalf</DialogTitle>
          <DialogDescription>
            The same fields and rules as their own Settings. They get a bell naming every field you change, with your note. Bank details are theirs alone - not here.
          </DialogDescription>
        </DialogHeader>

        {!form && state.status !== 'error' && <p className="text-sm text-muted-foreground">Reading…</p>}
        {form && (
          <form onSubmit={save} className="space-y-4 text-sm">
            <label className="block">
              <span className="font-medium">About the shop</span>
              <Textarea value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value.slice(0, 600) })} rows={3} className="mt-1" />
              <span className="text-xs text-muted-foreground">{form.about.length}/600 · a phone number or link in here goes to the Trust queue, same as when they type it.</span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              {LINKS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="font-medium">{label}</span>
                  <Input value={form.links?.[key] || ''} onChange={(e) => setForm({ ...form, links: { ...form.links, [key]: e.target.value } })} className="mt-1 h-9" />
                </label>
              ))}
            </div>

            <fieldset className="rounded-lg border p-3">
              <legend className="px-1 text-xs font-medium text-muted-foreground">Pickup address (all or nothing - a courier is sent to it)</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input placeholder="Contact name" value={form.pickupAddress.contactName} onChange={setPa('contactName')} className="h-9" />
                <Input placeholder="Phone (10 digits)" value={form.pickupAddress.phone} onChange={setPa('phone')} className="h-9" inputMode="tel" />
                <Input placeholder="Address line 1" value={form.pickupAddress.address1} onChange={setPa('address1')} className="h-9 sm:col-span-2" />
                <Input placeholder="Landmark (optional)" value={form.pickupAddress.address2} onChange={setPa('address2')} className="h-9 sm:col-span-2" />
                <Input placeholder="City" value={form.pickupAddress.city} onChange={setPa('city')} className="h-9" />
                <Input placeholder="State" value={form.pickupAddress.state} onChange={setPa('state')} className="h-9" />
                <Input placeholder="PIN code" value={form.pickupAddress.pincode} onChange={setPa('pincode')} className="h-9" inputMode="numeric" />
              </div>
              {/* The admin's half of a seller's courier setup (20 Sep 2026): Shiprocket only collects
                  from a saved, verified pickup address, named by its nickname. Add it there first
                  (Company Setup → Pick Up Address; the seller answers the OTP call), then name it here. */}
              <div className="mt-3">
                <Input placeholder="Shiprocket pickup nickname (as saved in Shiprocket, e.g. Primary)" value={form.shiprocketNickname || ''} onChange={(e) => setForm({ ...form, shiprocketNickname: e.target.value })} className="h-9" />
                <p className="mt-1 text-xs text-muted-foreground">Add this shop&rsquo;s address in Shiprocket first (Settings → Company Setup → Pick Up Address); the seller answers the verification call. Until this box is filled, their Ship button asks you to finish it.</p>
              </div>
            </fieldset>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span>Show their city on the shop page</span>
                <Switch checked={form.showLocation} onCheckedChange={(v) => setForm({ ...form, showLocation: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span>They pay delivery on everything</span>
                <Switch checked={form.offersFreeShipping} onCheckedChange={(v) => setForm({ ...form, offersFreeShipping: v })} />
              </label>
              {/* The AI's daily caps lifted for this one shop - the free AI quota is
                  one pool, so this is a by-hand decision per shop (20 Sep 2026). */}
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
                <span className="flex flex-col">
                  <span>AI without the daily limits</span>
                  <span className="text-xs text-muted-foreground">Like the house shop: no cap on drafts and photo edits. The free quota is shared, so give it shop by shop.</span>
                </span>
                <Switch checked={Boolean(form.aiUnlimited)} onCheckedChange={(v) => setForm({ ...form, aiUnlimited: v })} />
              </label>
            </div>

            <label className="block">
              <span className="font-medium">Note to the seller</span>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value.slice(0, 200) })} placeholder="As you asked on the phone - the pickup address is now the new shop." className="mt-1 h-9" />
              <span className="text-xs text-muted-foreground">Goes in their bell and mail with the list of what changed.</span>
            </label>

            {edits.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Earlier edits on their behalf: {edits.map((e) => `${new Date(e.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${e.fields.join(', ')}`).join(' · ')}
              </p>
            )}

            <DialogFooter className="items-center gap-3">
              <span aria-live="polite" className="mr-auto text-sm">
                {state.status === 'saved' && <span className="text-emerald-700 dark:text-emerald-300">{state.message}</span>}
                {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
              </span>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
              <Button type="submit" disabled={state.status === 'saving'}>{state.status === 'saving' ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : 'Save and tell them'}</Button>
            </DialogFooter>
          </form>
        )}
        {state.status === 'error' && !form && <p className="text-sm text-destructive">{state.message}</p>}
      </DialogContent>
    </Dialog>
  );
}
