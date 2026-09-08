'use client';

import { apiBase } from '@/lib/api';
import { getToken, clearSession } from '@/lib/session';

/**
 * Calling the API from the browser, as the signed-in customer.
 *
 * WHY IT THROWS THE SERVER'S OWN WORDS
 *   The server knows things the page does not - that the last one sold while
 *   this page was open, that a coupon expired. Replacing its message with a
 *   generic "something went wrong" throws away the only useful part.
 *
 * WHY A 401 CLEARS THE SESSION
 *   A token that the server refuses is not a session. Leaving it in storage
 *   means every page keeps rendering as though somebody is signed in, and every
 *   action fails - which reads as a broken shop rather than an expired login.
 */
export async function authedFetch(path, { method = 'GET', body, ...rest } = {}) {
  const token = getToken();

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...rest,
  });

  if (res.status === 401) {
    clearSession();
    throw new Error('Your session has ended. Please sign in again.');
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
    throw error;
  }
  return data;
}
