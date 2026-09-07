'use client';

import { useState } from 'react';
import { apiBase } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

/**
 * Asking for a reset link.
 *
 * THE ANSWER IS THE SAME EITHER WAY, ON PURPOSE
 *   The server replies with the same neutral message whether or not the address
 *   has an account. Saying "no account with that email" turns this form into a
 *   way to find out who shops here - which is worth money to somebody, and
 *   costs the person whose address was guessed.
 *
 *   So this page must not helpfully "improve" on that by reporting anything the
 *   server did not.
 */
export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle' });

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'sending' });
    try {
      const res = await fetch(`${apiBase}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      setState({ status: 'sent', message: data.message });
    } catch {
      setState({ status: 'error', message: 'Could not reach us just now. Try again in a moment.' });
    }
  };

  if (state.status === 'sent') {
    return (
      <p className="text-sm text-muted-foreground">
        {state.message || 'If that address has an account, a reset link is on its way.'}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="email" className="text-sm font-medium">
          Your email
        </Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
        />
      </div>

      <Button
        type="submit"
        disabled={state.status === 'sending'}
        size="lg"
        className="w-full"
      >
        {state.status === 'sending' ? 'Sending…' : 'Send me a link'}
      </Button>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>
    </form>
  );
}
