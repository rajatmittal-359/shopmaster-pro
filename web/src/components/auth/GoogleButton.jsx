'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { GOOGLE_CLIENT_ID as CLIENT_ID, ensureGsi, exchangeGoogleCredential, gsiReady } from '@/lib/googleSignIn';

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
export default function GoogleButton({ next = '/' }) {
  const router = useRouter();
  const holder = useRef(null);
  const signInRef = useRef(null);
  const [state, setState] = useState({ status: 'idle' });
  /*
   * Google draws this button, so the only say we have in how it looks is which
   * of their two themes to ask for. A white button on a dark card is the one
   * thing on the screen that did not get the memo, so the dark theme asks for
   * their black one. `resolvedTheme` rather than `theme`, because the default
   * is `system` and `system` is not a colour.
   */
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!CLIENT_ID) return undefined;

    let cancelled = false;

    const signIn = async (response) => {
      setState({ status: 'sending' });
      try {
        await exchangeGoogleCredential(response.credential);
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
      if (!gsiReady() || !holder.current) return undefined;

      clearInterval(timer);
      /*
       * initialize() once per page - lib/googleSignIn owns that, and hands the
       * credential to whichever surface registered last (this button, or the
       * One Tap prompt on the storefront). The effect re-runs when the theme
       * flips (the button has to be redrawn in Google's other colour), so the
       * handler is registered again each time; the SDK is not.
       */
      signInRef.current = signIn;
      ensureGsi((response) => signInRef.current?.(response));
      holder.current.replaceChildren();
      /*
       * Measured, not hardcoded. Google's button takes a pixel width and will
       * not stretch, so a fixed 320 sat narrower than the "Sign in" button
       * directly below it - two buttons of different widths stacked, which is
       * the single thing that made the screen look unfinished. 400 is the
       * widest Google accepts; below 200 their own label stops fitting.
       */
      const width = Math.min(400, Math.max(200, Math.round(holder.current.offsetWidth)));
      window.google.accounts.id.renderButton(holder.current, {
        theme: resolvedTheme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width,
      });
      return undefined;
    }, 100);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [next, router, resolvedTheme]);

  // Nothing to draw if the server was never given a client id - better an
  // absent button than one that fails when pressed.
  if (!CLIENT_ID) return null;

  return (
    <div className="space-y-2">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      {/* Google draws into this. The wrapper is full width so the button can be
          measured against it, and centres whatever Google actually produces. */}
      <div ref={holder} className="flex w-full justify-center" />

      <p aria-live="polite" className="min-h-5 text-center text-sm">
        {state.status === 'sending' && (
          <span className="text-muted-foreground">Signing you in…</span>
        )}
        {state.status === 'error' && <span className="text-destructive">{state.message}</span>}
      </p>
    </div>
  );
}
