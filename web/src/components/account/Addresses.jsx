'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { useSession } from '@/lib/session';
import AddressPicker from '@/components/checkout/AddressPicker';
import { Button } from '@/components/ui/button';

/**
 * Addresses, outside checkout.
 *
 * WHY THE SAME COMPONENT AS CHECKOUT
 *   It is the same job - list what exists, add one, choose the default. Two
 *   implementations of an address form is two sets of validation rules, and
 *   the day they disagree the one at checkout wins silently.
 *
 * WHY DELETE ASKS
 *   Orders keep the address they were shipped to, so removing one here changes
 *   nothing about past orders - but that is not obvious to the person pressing
 *   it, and saying so is cheaper than the worry.
 */
export default function Addresses() {
  const { signedIn } = useSession();
  const [addresses, setAddresses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState({ status: 'loading' });

  const load = async () => {
    const data = await authedFetch('/customer/addresses');
    const list = data.addresses || data || [];
    setAddresses(list);
    setSelected(list.find((a) => a.isDefault)?._id || list[0]?._id || null);
    setState({ status: 'idle' });
  };

  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/customer/addresses');
        if (cancelled) return;
        const list = data.addresses || data || [];
        setAddresses(list);
        setSelected(list.find((a) => a.isDefault)?._id || list[0]?._id || null);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <p className="text-muted-foreground">
        <Link href="/login?next=%2Faddresses" className="text-brand-ink underline">
          Sign in
        </Link>{' '}
        to manage your addresses.
      </p>
    );
  }

  if (state.status === 'loading') return <p className="text-muted-foreground">Loading…</p>;

  const act = async (fn) => {
    setState({ status: 'working' });
    try {
      await fn();
      await load();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <AddressPicker
        addresses={addresses}
        selectedId={selected}
        onSelect={setSelected}
        onAdded={() => load()}
      />

      {selected && addresses.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              act(() =>
                authedFetch(`/customer/addresses/${selected}`, {
                  method: 'PATCH',
                  body: { isDefault: true },
                })
              )
            }
          >
            Make this the default
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                window.confirm(
                  'Remove this address? Orders already sent to it keep their own copy, so nothing about them changes.'
                )
              ) {
                act(() =>
                  authedFetch(`/customer/addresses/${selected}`, { method: 'DELETE' })
                );
              }
            }}
          >
            Remove it
          </Button>
        </div>
      )}
    </div>
  );
}
