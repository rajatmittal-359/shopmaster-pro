'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { apiBase } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Choosing where it goes, and adding a new one without leaving the page.
 *
 * WHY THE FORM IS HERE AND NOT ON ITS OWN ROUTE
 *   Somebody adding an address is halfway through paying. Sending them to
 *   another page to do it means coming back to a checkout that has forgotten
 *   the delivery option and the payment method they had already chosen.
 *
 * THE PIN CODE IS SIX DIGITS AND CANNOT START WITH ZERO. The server enforces
 * it too - this is only so the person is told before they press save rather
 * than after.
 *
 * PIN CODE FIRST (19 Sep 2026)
 *   Amazon India, Flipkart and Meesho all take the PIN code and fill the
 *   city and state from it; Baymard puts the address form second among the
 *   places a checkout is abandoned, and a wrong state is the courier
 *   booking that fails. So: six digits typed -> India Post answers through
 *   /api/pincode -> city and state fill themselves (still editable), an
 *   unknown PIN is said out loud, and the courier check tells the person
 *   here - not after paying - that nobody delivers there yet. A landmark
 *   line, because that is what a Jaipur delivery boy actually reads.
 *   India Post down: the boxes stay typeable, nothing is blocked.
 */
const EMPTY = {
  label: 'Home',
  phoneNumber: '',
  street: '',
  landmark: '',
  city: '',
  state: '',
  zipCode: '',
};

const PIN_OK = /^[1-9]\d{5}$/;

/**
 * Asks India Post (/api/pincode) and the courier (/delivery) about a PIN code
 * once it is six digits; answers arrive in the promise chain, never
 * synchronously in the effect. `answer.zip` says which PIN the answer is for,
 * so a stale answer for the previous number is never shown for this one.
 */
const askPin = (zipCode) =>
  Promise.all([
    fetch(`${apiBase}/pincode/${zipCode}`).then((r) => (r.status === 404 ? null : r.ok ? r.json() : undefined)).catch(() => undefined),
    fetch(`${apiBase}/pincode/${zipCode}/delivery`).then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined),
  ]).then(([place, courier]) => {
    if (place === null) return { zip: zipCode, status: 'unknown' };
    if (place === undefined) return { zip: zipCode, status: 'down', serviceable: courier?.serviceable };
    return { zip: zipCode, status: 'found', place, serviceable: courier?.serviceable };
  });

export default function AddressPicker({ addresses, selectedId, onSelect, onAdded }) {
  const [adding, setAdding] = useState(addresses.length === 0);
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ status: 'idle' });
  const [answer, setAnswer] = useState({ zip: '', status: 'idle' });

  useEffect(() => {
    if (!PIN_OK.test(form.zipCode)) return undefined;
    let cancelled = false;
    askPin(form.zipCode).then((a) => {
      if (cancelled) return;
      setAnswer(a);
      // The PIN code fills city and state once, when it answers; what the person then types stays.
      if (a.status === 'found') setForm((f) => ({ ...f, city: f.city || a.place.city, state: a.place.state }));
    });
    return () => {
      cancelled = true;
    };
  }, [form.zipCode]);

  // What to show for the PIN typed right now: an answer for it, "looking" while it is on its way, nothing otherwise.
  const pin = answer.zip === form.zipCode ? answer : { status: PIN_OK.test(form.zipCode) ? 'looking' : 'idle' };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const cannotSave = pin.status === 'unknown' || pin.serviceable === false;

  const save = async (e) => {
    e.preventDefault();
    setState({ status: 'saving' });
    try {
      const data = await authedFetch('/customer/addresses', { method: 'POST', body: form });
      setForm(EMPTY);
      setAdding(false);
      setState({ status: 'idle' });
      onAdded(data.address);
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const field = 'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <section className="rounded-xl border border-border p-4">
      <h2 className="font-semibold">Deliver to</h2>

      {addresses.length > 0 && (
        <ul className="mt-3 space-y-2">
          {addresses.map((address) => (
            <li key={address._id}>
              <label className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="address"
                  checked={selectedId === address._id}
                  onChange={() => onSelect(address._id)}
                  className="mt-1"
                />
                <span>
                  <strong>{address.label || 'Address'}</strong>
                  <span className="block text-muted-foreground">
                    {address.street}{address.landmark ? `, ${address.landmark}` : ''}, {address.city}, {address.state} {address.zipCode}
                  </span>
                  <span className="block text-muted-foreground">{address.phoneNumber}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <Button
          onClick={() => setAdding(true)}
          className="mt-3" variant="link" size="sm">
          Add another address
        </Button>
      ) : (
        <form onSubmit={save} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="label" className="text-sm">Name this address</label>
              <Input id="label" value={form.label} onChange={set('label')} className="mt-1" placeholder="Home, Office" />
            </div>
            <div>
              <label htmlFor="phoneNumber" className="text-sm">Mobile number</label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">+91</span>
                <Input
                  id="phoneNumber"
                  required
                  inputMode="numeric"
                  autoComplete="tel-national"
                  pattern="[6-9][0-9]{9}"
                  title="10 digits, starting 6-9"
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                />
              </div>
            </div>
          </div>

          {/* PIN first: it fills the two boxes under it and tells the truth about delivery early. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="zipCode" className="text-sm">PIN code</label>
              <Input
                id="zipCode"
                required
                inputMode="numeric"
                autoComplete="postal-code"
                pattern="[1-9][0-9]{5}"
                value={form.zipCode}
                onChange={(e) => setForm({ ...form, zipCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                className="mt-1"
                aria-describedby="pinHelp"
              />
            </div>
            <div>
              <label htmlFor="city" className="text-sm">City / town</label>
              <Input id="city" required value={form.city} onChange={set('city')} className="mt-1" autoComplete="address-level2" />
            </div>
            <div>
              <label htmlFor="state" className="text-sm">State</label>
              <Input id="state" required value={form.state} onChange={set('state')} className="mt-1" autoComplete="address-level1" />
            </div>
          </div>
          <p id="pinHelp" aria-live="polite" className="min-h-5 text-xs">
            {pin.status === 'looking' && <span className="text-muted-foreground">Checking the PIN code&hellip;</span>}
            {pin.status === 'unknown' && <span className="text-destructive">No such PIN code - check the six digits.</span>}
            {pin.status === 'found' && pin.serviceable === false && <span className="text-destructive">Couriers do not deliver to {pin.place.city} {form.zipCode} yet - try another address.</span>}
            {pin.status === 'found' && pin.serviceable !== false && (
              <span className="text-muted-foreground">
                {pin.place.city}, {pin.place.state}{pin.place.areas?.length ? ` - ${pin.place.areas.slice(0, 3).join(', ')}${pin.place.areas.length > 3 ? '...' : ''}` : ''}
              </span>
            )}
            {pin.status === 'down' && <span className="text-muted-foreground">Could not check the PIN code right now - type the city and state.</span>}
          </p>

          <div>
            <label htmlFor="street" className="text-sm">House / flat, building, street</label>
            <Input id="street" required value={form.street} onChange={set('street')} className="mt-1" autoComplete="address-line1" placeholder="12, Shanti Niketan, MI Road" />
          </div>
          <div>
            <label htmlFor="landmark" className="text-sm">Landmark <span className="text-muted-foreground">(optional)</span></label>
            <Input id="landmark" value={form.landmark} onChange={set('landmark')} className="mt-1" maxLength={80} placeholder="Near Hawa Mahal gate" />
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={state.status === 'saving' || cannotSave}>
              {state.status === 'saving' ? 'Saving…' : 'Save address'}
            </Button>
            {addresses.length > 0 && (
              <Button type="button" onClick={() => setAdding(false)} variant="ghost" size="sm">
                Cancel
              </Button>
            )}
          </div>

          <p aria-live="polite" className="min-h-5 text-sm">
            {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
          </p>
        </form>
      )}
    </section>
  );
}
