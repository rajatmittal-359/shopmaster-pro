'use client';

import { apiBase } from '@/lib/api';
import { getToken, clearSession, setSession } from '@/lib/session';

/**
 * Calling the API from the browser, as the signed-in person.
 *
 * HOW THE SESSION TRAVELS (19 Sep 2026)
 *   In the httpOnly cookies the API set at sign-in - `credentials: 'include'`
 *   sends them, nothing here can read them, which is the point. Every
 *   state-changing call also carries `X-Requested-With: fetch`: a cross-site
 *   form cannot set that header, so a stolen click cannot act as the person
 *   (the API refuses cookie-authenticated writes without it). A token left
 *   in localStorage by the old app is still sent as a header until it runs
 *   out, so nobody was signed out on the day this changed.
 *
 * WHAT A 401 MEANS NOW
 *   `expired`: the hour-long access token ran out - refresh once with the
 *   thirty-day cookie and retry the same call; the person never notices.
 *   `reauth`: this action wants the password again (bank details, a payout,
 *   a dispute ruling) - the error carries the code and the page opens the
 *   confirm dialog. Anything else: the session is over; clear the local
 *   copy so the pages stop drawing a signed-in person who is not.
 *
 * WHY IT THROWS THE SERVER'S OWN WORDS
 *   The server knows things the page does not - that the last one sold while
 *   this page was open, that a coupon expired. Replacing its message with a
 *   generic "something went wrong" throws away the only useful part.
 */
const headersFor = (body, extra = {}) => {
  const token = getToken();
  return {
    'X-Requested-With': 'fetch',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
};

let refreshing = null;
/** One refresh at a time - ten tabs waking together must not race the rotation. */
const refreshOnce = () => {
  if (!refreshing) {
    refreshing = fetch(`${apiBase}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'fetch' } })
      .then(async (r) => {
        if (!r.ok) return false;
        const d = await r.json().catch(() => ({}));
        if (d.user) setSession({ role: d.role, user: d.user });
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

export async function authedFetch(path, { method = 'GET', body, headers: extraHeaders, ...rest } = {}) {
  const send = () =>
    fetch(`${apiBase}${path}`, {
      method,
      credentials: 'include',
      headers: headersFor(body, extraHeaders),
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...rest,
    });

  let res = await send();

  if (res.status === 401) {
    const data = await res.clone().json().catch(() => ({}));
    if (data.code === 'expired' || data.code === 'no_session') {
      if (await refreshOnce()) res = await send();
    }
    if (res.status === 401) {
      const again = await res.clone().json().catch(() => ({}));
      if (again.code === 'reauth') {
        const error = new Error(again.message || 'Please confirm your password to continue.');
        error.status = 401;
        error.code = 'reauth';
        throw error;
      }
      clearSession();
      const error = new Error('Your session has ended. Please sign in again.');
      error.status = 401;
      error.code = again.code || 'no_session';
      throw error;
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    /*
     * The STATUS travels with the error, not just the message. Callers need to
     * tell "this failed, try again" apart from "this account is not allowed to
     * do this, and trying again will never help" - and a 403 on the cart is
     * exactly the second one: an admin account is deliberately refused a cart,
     * so offering a retry button is a lie.
     */
    const error = new Error(data.message || 'That did not work. Please try again.');
    error.status = res.status;
    error.code = data.code;
    throw error;
  }
  /*
   * The header's cart and saved-items badges (useCounts) listen for this: any
   * write to the cart or the wishlist, from any page, and they ask again. One
   * event beats threading a callback through every button.
   */
  if (method !== 'GET' && /^\/customer\/(cart|wishlist)(\/|$|\?)/.test(path) && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('smp:counts'));
  }
  return data;
}

/** Sign out: the server ends this device's session and clears the cookies; then the local copy goes. */
export async function signOut() {
  try {
    await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'include', headers: headersFor(false) });
  } catch {
    /* offline - the local copy still goes; the server session dies in an hour or on next use */
  }
  clearSession();
}
