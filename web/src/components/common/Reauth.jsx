'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Step-up (19 Sep 2026): the password again before money or identity moves.
 *
 * The API answers 401 { code: 'reauth' } on bank details, paying a payout,
 * ruling on a dispute, changing a commission. `useReauth().run(fn)` calls fn;
 * on that code it opens this dialog, posts the password to /auth/reauth (a
 * ten-minute httpOnly cookie comes back) and calls fn again - the person
 * sees one password field, not an error. Amazon does exactly this before a
 * payment method changes.
 *
 * "Email me a code instead" covers a Google-only account (no password) and
 * anyone who prefers it: POST /auth/reauth/code mails a six-digit code,
 * POST /auth/reauth { otp } confirms it - same ten-minute cookie.
 */
const Ctx = createContext(null);

export function ReauthProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('password'); // 'password' | 'code'
  const [otp, setOtp] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const pending = useRef(null);

  const close = useCallback((ok) => {
    setOpen(false);
    setPassword('');
    setOtp('');
    setMode('password');
    setState({ status: 'idle' });
    const p = pending.current;
    pending.current = null;
    if (p) (ok ? p.resolve : p.reject)(ok ? true : Object.assign(new Error('Not confirmed'), { code: 'reauth_cancelled' }));
  }, []);

  const ask = useCallback(
    () =>
      new Promise((resolve, reject) => {
        pending.current = { resolve, reject };
        setOpen(true);
      }),
    []
  );

  const confirm = async (e) => {
    e.preventDefault();
    setState({ status: 'sending' });
    try {
      await authedFetch('/auth/reauth', { method: 'POST', body: mode === 'code' ? { otp } : { password } });
      close(true);
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const sendCode = async () => {
    setState({ status: 'sending' });
    try {
      const d = await authedFetch('/auth/reauth/code', { method: 'POST' });
      setMode('code');
      setState({ status: 'idle', note: d.message });
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  const value = useMemo(
    () => ({
      /** Run an action; if the API wants the password first, ask, then run it again. */
      run: async (fn) => {
        try {
          return await fn();
        } catch (err) {
          if (err?.code !== 'reauth') throw err;
          await ask();
          return fn();
        }
      },
    }),
    [ask]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={(o) => !o && close(false)}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={confirm} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Confirm it is you</DialogTitle>
              <DialogDescription>This changes money or account details, so we ask for your password once more. It holds for ten minutes.</DialogDescription>
            </DialogHeader>
            {mode === 'password' ? (
              <div className="space-y-1.5">
                <Label htmlFor="reauth-password">Password</Label>
                <Input id="reauth-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={sendCode} className="text-xs text-brand-ink underline">
                  No password (signed in with Google)? Email me a code instead
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="reauth-code">The code from the email</Label>
                <Input id="reauth-code" inputMode="numeric" autoComplete="one-time-code" autoFocus value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} />
                {state.note && <p className="text-xs text-muted-foreground">{state.note}</p>}
                <button type="button" onClick={sendCode} className="text-xs text-brand-ink underline">
                  Send a new code
                </button>
              </div>
            )}
            {state.status === 'error' && <p className="text-sm text-destructive">{state.message}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={state.status === 'sending' || (mode === 'password' ? !password : otp.length !== 6)}>
                {state.status === 'sending' ? 'Checking…' : 'Confirm'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

/** `const { run } = useReauth(); await run(() => authedFetch(...))` */
export function useReauth() {
  const ctx = useContext(Ctx);
  // Outside a provider (a stray test render) the action just runs; the server still refuses without step-up.
  return ctx || { run: (fn) => fn() };
}
