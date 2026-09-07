'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiBase } from '@/lib/api';
import { setSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Creating an account, in two steps on one page.
 *
 * WHY THE CODE STEP IS NOT A SEPARATE ROUTE
 *   The email is already in memory here. A separate page would have to carry it
 *   in the URL, where it is logged by every proxy in between, or ask for it
 *   again - and asking somebody to retype the address they just gave, at the
 *   exact moment they are waiting for an email, is where people leave.
 *
 * NOTHING ABOUT SELLING APPEARS HERE
 *   One kind of account. Becoming a seller is an upgrade applied to an account
 *   that already exists - see section 9 of FRONTEND-PLAN.md. Asking "are you a
 *   buyer or a seller?" at sign-up is the model this rebuild is removing.
 */
export default function RegisterForm({ next = '/', verifyEmail = '' }) {
  const router = useRouter();
  const [step, setStep] = useState(verifyEmail ? 'code' : 'details');
  const [form, setForm] = useState({ name: '', email: verifyEmail, password: '' });
  const [otp, setOtp] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const post = async (path, body) => {
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'That did not work');
    return data;
  };

  const register = async (e) => {
    e.preventDefault();
    setState({ status: 'sending' });
    try {
      const data = await post('/auth/register', form);
      setStep('code');
      // The account exists even when the email did not send - the server says
      // so, and hiding that would leave somebody waiting for a code that is
      // never coming.
      setState({
        status: 'idle',
        note:
          data.emailSent === false
            ? 'Account created, but the code could not be sent. Ask for a new one below.'
            : null,
      });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setState({ status: 'sending' });
    try {
      const data = await post('/auth/verify-otp', { email: form.email, otp });
      // Verifying returns a token, so nobody is asked to sign in immediately
      // after proving they own the address.
      setSession({ token: data.token, role: data.role, user: data.user });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const resend = async () => {
    setState({ status: 'sending' });
    try {
      const data = await post('/auth/resend-otp', { email: form.email });
      setState({ status: 'idle', note: data.message });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const input =
    'mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring';

  if (step === 'code') {
    return (
      <form onSubmit={verify} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We sent a code to <strong className="text-foreground">{form.email}</strong>.
        </p>

        <div>
          <label htmlFor="otp" className="text-sm font-medium">
            The code
          </label>
          <Input
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={input}
          />
        </div>

        <Button
          type="submit"
          disabled={state.status === 'sending'}
          className="w-full" size="lg">
          {state.status === 'sending' ? 'Checking…' : 'Verify and continue'}
        </Button>

        <div aria-live="polite" className="min-h-5 text-sm">
          {state.status === 'error' && <p className="text-destructive">{state.message}</p>}
          {state.note && <p className="text-muted-foreground">{state.note}</p>}
        </div>

        <Button type="button" onClick={resend} variant="link" size="sm">
          Send the code again
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={register} className="space-y-4">
      <div>
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <Input id="name" required autoComplete="name" value={form.name} onChange={set('name')} className={input} />
      </div>

      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          className={input}
        />
      </div>

      <div>
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={form.password}
          onChange={set('password')}
          className={input}
        />
      </div>

      {/*
        WHY THE SELLER CHOICE IS STILL HERE
          Section 10 argues for one account with selling ADDED to it, and that
          is still the right end state. But the API creates the Seller record at
          registration from `role`, and there is no endpoint that upgrades an
          existing account - so removing this box would leave nobody able to
          become a seller at all. Parity first; the capability model is backend
          work with its own risk, and section 7a says it ships separately.
      */}
      <div className="rounded-lg border border-border p-3">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={form.role === 'seller'}
            onChange={(e) => setForm({ ...form, role: e.target.checked ? 'seller' : 'customer' })}
            className="mt-1"
          />
          <span>
            <strong>I want to sell on ShopMaster Pro</strong>
            <span className="block text-muted-foreground">
              An admin approves every shop before anything of yours appears.
            </span>
          </span>
        </label>

        {form.role === 'seller' && (
          <div className="mt-3">
            <label htmlFor="businessName" className="text-sm font-medium">
              Your shop&rsquo;s name
            </label>
            <Input
              id="businessName"
              required
              value={form.businessName}
              onChange={set('businessName')}
              className="mt-1"
            />
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={state.status === 'sending'}
        className="w-full" size="lg">
        {state.status === 'sending' ? 'Creating…' : 'Create account'}
      </Button>

      <div aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <p className="text-destructive">{state.message}</p>}
      </div>

      <p className="text-sm text-muted-foreground">
        Already have one?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-brand-ink hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
