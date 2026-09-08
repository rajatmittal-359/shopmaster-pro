'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authedFetch } from '@/lib/client';
import { useSession, setCapabilities } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
 * WHAT IT PROMISES, AND WHAT IT DOES NOT
 *   It creates the application. An admin approves it, and nothing of theirs is
 *   public until then - which the button says, rather than implying that
 *   pressing it opens a shop.
 */
export default function ApplyToSell() {
  const router = useRouter();
  const { signedIn, canSell, capabilities } = useSession();
  const [businessName, setBusinessName] = useState('');
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
        <Button asChild size="lg">
          <Link href="/register?sell=1">Create an account and apply</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/login?next=%2Fsell">I already have an account</Link>
        </Button>
      </div>
    );
  }

  if (canSell) {
    return (
      <div className="rounded-xl border border-border p-4">
        <p className="font-medium">
          {capabilities?.sellerApproved
            ? 'This account already sells on ShopMaster Pro.'
            : 'Your application is with us - an admin is reviewing it.'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {capabilities?.sellerApproved
            ? 'Your dashboard has your orders, products and earnings.'
            : 'You can open your dashboard now, but nothing of yours is public until it is approved.'}
        </p>
        <Button asChild className="mt-3">
          <Link href="/seller">Open the seller dashboard</Link>
        </Button>
      </div>
    );
  }

  if (state.status === 'applied') {
    return (
      <div className="rounded-xl border border-border p-4">
        <p className="font-medium">Thank you - that is with us now.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          A person reads every application. You keep your cart, your orders and
          this same account either way.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ status: 'sending' });
        try {
          await authedFetch('/auth/become-seller', { method: 'POST', body: { businessName } });
          // Re-read rather than assume: the answer that matters is the one the
          // server will give every other page.
          const me = await authedFetch('/auth/me');
          setCapabilities(me.capabilities);
          setState({ status: 'applied' });
          router.refresh();
        } catch (err) {
          setState({ status: 'error', message: err.message });
        }
      }}
      className="max-w-md space-y-3 rounded-xl border border-border p-4"
    >
      <div>
        <label htmlFor="businessName" className="text-sm font-medium">
          What is your shop called?
        </label>
        <Input
          id="businessName"
          required
          minLength={2}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          className="mt-1"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          This is the name customers see beside your products.
        </p>
      </div>

      <Button type="submit" size="lg" disabled={state.status === 'sending'}>
        {state.status === 'sending' ? 'Sending…' : 'Apply to sell'}
      </Button>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>

      <p className="text-xs text-muted-foreground">
        You are applying with the account you are already signed in to. You keep
        your cart and your orders - selling is added to it, not instead of it.
      </p>
    </form>
  );
}
