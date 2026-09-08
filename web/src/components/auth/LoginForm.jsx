'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiBase } from '@/lib/api';
import { setSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Signing in.
 *
 * WHY IT DOES NOT USE authedFetch
 *   That helper treats any 401 as an expired session and clears storage. Here a
 *   401 means something else entirely: the account exists but the email was
 *   never verified. Handling it needs the body, and the answer is a link to
 *   finish verifying - not "please sign in again", which is what the person is
 *   already trying to do.
 *
 * WHERE IT SENDS PEOPLE AFTERWARDS
 *   Back where they were. Somebody who pressed "add to cart" on a product page
 *   and was asked to sign in should land on that product, not on a home page
 *   that has forgotten what they wanted.
 */
export default function LoginForm({ next = '/' }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [state, setState] = useState({ status: 'idle' });
  /*
   * A password nobody can see is a password typed wrong on a phone keyboard,
   * and the failure is silent until the form is refused. Every bank and every
   * large retailer now offers the toggle for that reason. It starts hidden -
   * the shoulder-surfing case is real too - and it never persists.
   */
  const [showPassword, setShowPassword] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending' });

    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401 && data.needsVerification) {
        setState({ status: 'unverified', email: data.email || form.email });
        return;
      }
      if (!res.ok) throw new Error(data.message || 'Could not sign you in');

      setSession({ token: data.token, role: data.role, user: data.user });

      // replace, not push: the back button must not return to a sign-in form
      // that is no longer true.
      router.replace(next);
      router.refresh();
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          value={form.email}
          onChange={set('email')}
          className="mt-1 w-full"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Link href="/forgot-password" className="text-xs text-brand-ink hover:underline">
            Forgotten it?
          </Link>
        </div>
        <div className="relative mt-1">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            value={form.password}
            onChange={set('password')}
            className="w-full pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((shown) => !shown)}
            // The label says what pressing it DOES, which is what a screen
            // reader user needs; the icon shows the same thing to everyone else.
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={state.status === 'sending'}
        className="w-full" size="lg">
        {state.status === 'sending' ? 'Signing in…' : 'Sign in'}
      </Button>

      <div aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <p className="text-destructive">{state.message}</p>}
        {state.status === 'unverified' && (
          <p className="text-muted-foreground">
            This email still needs verifying.{' '}
            <Link
              href={`/register?verify=${encodeURIComponent(state.email)}`}
              className="text-brand-ink underline"
            >
              Finish that here
            </Link>
            .
          </p>
        )}
      </div>

      {/*
       * Separated by a rule rather than left as one more line of small print.
       * A first-time visitor who cannot find the way to create an account tries
       * to sign in with an account that does not exist, fails, and leaves.
       */}
      <p className="border-t pt-4 text-center text-sm text-muted-foreground">
        New to ShopMaster Pro?{' '}
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="font-medium text-brand-ink hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
