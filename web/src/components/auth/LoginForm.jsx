'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiBase } from '@/lib/api';
import { setSession } from '@/lib/session';

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
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={form.password}
          onChange={set('password')}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <button
        type="submit"
        disabled={state.status === 'sending'}
        className="h-11 w-full rounded-lg bg-primary font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
      >
        {state.status === 'sending' ? 'Signing in…' : 'Sign in'}
      </button>

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

      <p className="text-sm text-muted-foreground">
        No account yet?{' '}
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="text-brand-ink hover:underline"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
