'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { apiBase } from '@/lib/api';
import { setSession } from '@/lib/session';

/**
 * "Continue with Google".
 *
 * WHY IT IS GOOGLE'S OWN BUTTON AND NOT ONE OF OURS
 *   Google renders it, and their terms require their branding on it. It also
 *   means the account chooser is drawn by the browser rather than by us - which
 *   since Chrome dropped third-party cookies is the only way it works at all.
 *
 * WHAT COMES BACK
 *   One string: an ID token. It goes to our own API, which verifies it against
 *   our client id and issues OUR session - the same one the password form
 *   issues. Google proves who somebody is; it does not become a second place
 *   sessions live.
 *
 * WHY EMAIL AND PASSWORD STAY ON THE PAGE BESIDE IT
 *   A link opened inside the Instagram or Facebook in-app browser gets
 *   `403 disallowed_useragent` from Google - those webviews are blocked
 *   outright. Instagram is where this shop's traffic comes from, so Google can
 *   never be the only door.
 */
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function GoogleButton({ next = '/' }) {
  const router = useRouter();
  const holder = useRef(null);
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    if (!CLIENT_ID) return undefined;

    let cancelled = false;

    const signIn = async (response) => {
      setState({ status: 'sending' });
      try {
        const res = await fetch(`${apiBase}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || 'Could not sign you in with Google');

        setSession({ token: data.token, role: data.role, user: data.user });
        router.replace(next);
        router.refresh();
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    };

    /*
     * The script is loaded by <Script> below, so it may not be there on the
     * first pass. Polling briefly is simpler than an onLoad callback that has
     * to survive this component remounting, and it stops after a few seconds
     * rather than running forever.
     */
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (cancelled || tries > 40) return clearInterval(timer);
      if (!window.google?.accounts?.id || !holder.current) return undefined;

      clearInterval(timer);
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: signIn,
      });
      window.google.accounts.id.renderButton(holder.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        width: 320,
      });
      return undefined;
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [next, router]);

  // Nothing to draw if the server was never given a client id - better an
  // absent button than one that fails when pressed.
  if (!CLIENT_ID) return null;

  return (
    <div className="space-y-2">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      {/* Google draws into this. It has its own fixed size, so the wrapper only
          centres it. */}
      <div ref={holder} className="flex justify-center" />

      <p aria-live="polite" className="min-h-5 text-center text-sm">
        {state.status === 'sending' && (
          <span className="text-muted-foreground">Signing you in…</span>
        )}
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>
    </div>
  );
}
