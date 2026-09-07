'use client';

import { useState } from 'react';
import { apiBase } from '@/lib/api';

/**
 * "Get it by Tuesday" - the single cheapest conversion difference on an Indian
 * product page. All seven competitors checked (GIVA, Salty, Palmonas, Melorra,
 * BlueStone, CaratLane, Myntra) have this box.
 *
 * THE HONESTY IT INHERITS
 *   The date comes from the CHEAPEST courier, because that is the one booked at
 *   dispatch. The server decides that; this box only shows what it returns, and
 *   when the server cannot check, this shows nothing rather than a guess.
 *
 * WHY IT IS A CLIENT ISLAND
 *   It is the only interactive thing in this column. Everything around it -
 *   price, stock, description - is server-rendered and in the first HTML byte
 *   stream, which is what Google and the AI crawlers read.
 */
const formatDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export default function PincodeCheck() {
  const [code, setCode] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  const check = async (e) => {
    e.preventDefault();
    if (!/^[1-9][0-9]{5}$/.test(code)) {
      setState({ status: 'invalid' });
      return;
    }

    setState({ status: 'checking' });
    try {
      const res = await fetch(`${apiBase}/pincode/${code}/delivery`);
      if (!res.ok) throw new Error(String(res.status));
      setState({ status: 'done', data: await res.json() });
    } catch {
      // No date, and no apology dressed up as one. The shipping policy below
      // still tells them the normal range.
      setState({ status: 'unavailable' });
    }
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm font-medium">Check delivery to your PIN code</p>

      <form onSubmit={check} className="mt-2 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="302019"
          aria-label="PIN code"
          className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={state.status === 'checking'}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
        >
          {state.status === 'checking' ? 'Checking…' : 'Check'}
        </button>
      </form>

      <div aria-live="polite" className="mt-2 text-sm">
        {state.status === 'invalid' && (
          <p className="text-muted-foreground">That is not a six-digit PIN code.</p>
        )}

        {state.status === 'done' && state.data.serviceable && (
          <p>
            Arrives by{' '}
            <strong className="text-foreground">{formatDate(state.data.deliveryBy)}</strong>
            <span className="block text-xs text-muted-foreground">
              Dispatched within {state.data.dispatchDays} working days, then{' '}
              {state.data.transitDays} in transit.
            </span>
          </p>
        )}

        {state.status === 'done' && !state.data.serviceable && (
          <p className="text-muted-foreground">
            No courier delivers to {state.data.pincode} for us yet. Better to know
            now than at checkout.
          </p>
        )}

        {state.status === 'unavailable' && (
          <p className="text-muted-foreground">
            Could not check that just now. See the shipping policy for the usual
            times.
          </p>
        )}
      </div>
    </div>
  );
}
