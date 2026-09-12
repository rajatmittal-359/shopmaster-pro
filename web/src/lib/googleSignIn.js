import { apiBase } from '@/lib/api';
import { setSession } from '@/lib/session';

/**
 * The one place Google Identity is initialised and its credential exchanged.
 *
 * Google's `initialize()` may be called once per page; the button on the
 * login page and the One Tap prompt on the storefront both need it, and
 * whichever is on screen must receive the credential. So the SDK is
 * initialised once with a dispatcher, and each surface registers the
 * handler it wants while it is mounted.
 */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

/** ID token → our own session. Throws with the server's words on refusal. */
export const exchangeGoogleCredential = async (credential) => {
  const res = await fetch(`${apiBase}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Could not sign you in with Google');
  setSession({ token: data.token, role: data.role, user: data.user });
  return data;
};

/** True once the GSI script has arrived. */
export const gsiReady = () => typeof window !== 'undefined' && Boolean(window.google?.accounts?.id);

/** Initialise once; later calls only swap the handler. */
export const ensureGsi = (onCredential, options = {}) => {
  if (!gsiReady() || !GOOGLE_CLIENT_ID) return false;
  window.__smpGsiCallback = onCredential;
  if (!window.__smpGsiInitialised) {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => window.__smpGsiCallback?.(response),
      // Chrome now shows One Tap through FedCM; this is the supported path.
      use_fedcm_for_prompt: true,
      ...options,
    });
    window.__smpGsiInitialised = true;
  }
  return true;
};
