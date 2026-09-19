'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile widget (plan 2.28) - the bot check on sign-up and
 * the seller application. Renders nothing without the public site key, so
 * a laptop or a deploy without the key behaves exactly as before; the
 * server side is off in the same case (middlewares/turnstile.js).
 *
 * The script is loaded once, explicitly, and the widget is rendered into
 * our own div so it survives re-renders; `onToken` hands the form the
 * token to send as `turnstileToken`. Managed mode: most people see nothing
 * or a one-tap checkbox; the puzzle is reserved for traffic Cloudflare
 * already distrusts. Reset on expiry so a slow form does not submit a dead
 * token.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const turnstileEnabled = () => Boolean(SITE_KEY);

let loading = null;
const loadScript = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = SCRIPT;
      s.async = true;
      s.onload = () => resolve(window.turnstile || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  return loading;
};

export default function Turnstile({ onToken, action = 'form', className = '' }) {
  const box = useRef(null);
  const widget = useRef(null);
  const cb = useRef(onToken);
  // Latest handler without re-rendering the widget - set in an effect, read in the callback.
  useEffect(() => {
    cb.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let cancelled = false;
    loadScript().then((ts) => {
      if (cancelled || !ts || !box.current || widget.current !== null) return;
      widget.current = ts.render(box.current, {
        sitekey: SITE_KEY,
        action,
        theme: 'auto',
        size: 'flexible',
        callback: (token) => cb.current?.(token),
        'expired-callback': () => cb.current?.(''),
        'error-callback': () => cb.current?.(''),
      });
    });
    return () => {
      cancelled = true;
      if (widget.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widget.current);
        } catch {
          /* already gone */
        }
      }
      widget.current = null;
    };
  }, [action]);

  if (!SITE_KEY) return null;
  return <div ref={box} className={className} aria-label="Security check" />;
}
