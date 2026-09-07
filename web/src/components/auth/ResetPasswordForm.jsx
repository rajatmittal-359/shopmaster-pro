'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiBase } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * Setting a new password from the link in the email.
 *
 * WHY THIS ROUTE HAS TO EXIST BEFORE THE REACT APP IS DELETED
 *   The backend builds the link as `${FRONTEND_URL}/reset-password?token=...`.
 *   The day the domain points at this app and this page does not exist, every
 *   reset email in flight leads to a 404 - and the people it leads there are,
 *   by definition, the ones already locked out.
 *
 * THE TOKEN IS NEVER SHOWN OR LOGGED. It is read from the URL and posted; it is
 * a password in every sense that matters for the next few minutes.
 */
export default function ResetPasswordForm({ token }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        This link is incomplete. Reset links expire, so{' '}
        <Link href="/forgot-password" className="text-brand-ink underline">
          ask for a new one
        </Link>
        .
      </p>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending' });
    try {
      const res = await fetch(`${apiBase}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'That link did not work');

      // Deliberately NOT signed in here. Resetting proves control of the
      // mailbox, not of the password - and asking for the new one once, now,
      // is what makes it stick.
      setState({ status: 'done' });
      setTimeout(() => router.push('/login'), 1200);
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  if (state.status === 'done') {
    return (
      <p className="text-sm">
        Done. Taking you to{' '}
        <Link href="/login" className="text-brand-ink underline">
          sign in
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="password" className="text-sm font-medium">
          New password
        </Label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1"
        />
      </div>

      <Button
        type="submit"
        disabled={state.status === 'sending'}
        size="lg"
        className="w-full"
      >
        {state.status === 'sending' ? 'Saving…' : 'Set the new password'}
      </Button>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>
    </form>
  );
}
