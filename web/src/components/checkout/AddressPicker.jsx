'use client';

import { useState } from 'react';
import { authedFetch } from '@/lib/client';

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
 */
const EMPTY = {
  label: 'Home',
  phoneNumber: '',
  street: '',
  city: '',
  state: '',
  zipCode: '',
};

export default function AddressPicker({ addresses, selectedId, onSelect, onAdded }) {
  const [adding, setAdding] = useState(addresses.length === 0);
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ status: 'idle' });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

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
                    {address.street}, {address.city}, {address.state} {address.zipCode}
                  </span>
                  <span className="block text-muted-foreground">{address.phoneNumber}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 text-sm text-brand-ink hover:underline"
        >
          Add another address
        </button>
      ) : (
        <form onSubmit={save} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="label" className="text-sm">Name this address</label>
              <input id="label" value={form.label} onChange={set('label')} className={field} />
            </div>
            <div>
              <label htmlFor="phoneNumber" className="text-sm">Phone</label>
              <input
                id="phoneNumber"
                required
                inputMode="numeric"
                value={form.phoneNumber}
                onChange={set('phoneNumber')}
                className={field}
              />
            </div>
          </div>

          <div>
            <label htmlFor="street" className="text-sm">Address</label>
            <input id="street" required value={form.street} onChange={set('street')} className={field} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="city" className="text-sm">City</label>
              <input id="city" required value={form.city} onChange={set('city')} className={field} />
            </div>
            <div>
              <label htmlFor="state" className="text-sm">State</label>
              <input id="state" required value={form.state} onChange={set('state')} className={field} />
            </div>
            <div>
              <label htmlFor="zipCode" className="text-sm">PIN code</label>
              <input
                id="zipCode"
                required
                inputMode="numeric"
                pattern="[1-9][0-9]{5}"
                value={form.zipCode}
                onChange={(e) => setForm({ ...form, zipCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                className={field}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={state.status === 'saving'}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {state.status === 'saving' ? 'Saving…' : 'Save address'}
            </button>
            {addresses.length > 0 && (
              <button type="button" onClick={() => setAdding(false)} className="text-sm text-muted-foreground">
                Cancel
              </button>
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
