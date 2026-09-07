'use client';

import { useSyncExternalStore } from 'react';

/**
 * Who is signed in, on the browser side.
 *
 * WHY THESE EXACT KEYS
 *   `smp_token` and `smp_role` are what the React app already writes. The two
 *   apps will share a domain during the cutover, so one signed-in session has
 *   to serve both - anything else logs every customer out on the day we switch.
 *   `smp_user` is added alongside them and ignored by the old app.
 *
 * WHY IT IS A STORE AND NOT A CONTEXT
 *   The session is read by a handful of components in different trees - the
 *   header, the buy box, the cart. A provider would have to wrap the whole app
 *   and turn it into a client component, which is exactly what this rebuild
 *   exists to avoid. useSyncExternalStore reads it where it is needed and
 *   nowhere else.
 */
const TOKEN = 'smp_token';
const ROLE = 'smp_role';
const USER = 'smp_user';

/** localStorage throws outright in some privacy modes. Never let that crash a page. */
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Nothing to do. The person stays signed in for this page view only, which
    // is better than an error where a sign-in button should be.
  }
};

/*
 * `storage` only fires in OTHER tabs. Signing in has to update THIS one too, so
 * every write announces itself and both are listened to.
 */
const CHANGED = 'smp-session-changed';

const announce = () => window.dispatchEvent(new Event(CHANGED));

export const setSession = ({ token, role, user }) => {
  write(TOKEN, token);
  write(ROLE, role || null);
  write(USER, user ? JSON.stringify(user) : null);
  announce();
};

export const clearSession = () => {
  write(TOKEN, null);
  write(ROLE, null);
  write(USER, null);
  announce();
};

export const getToken = () => read(TOKEN);

const subscribe = (onChange) => {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
};

/*
 * The snapshot must be a STABLE value or React re-renders forever: building a
 * fresh object each call means every comparison says "changed". So the raw
 * string is the snapshot, and the object is derived from it.
 */
const snapshot = () => `${read(TOKEN) || ''}|${read(ROLE) || ''}|${read(USER) || ''}`;

/** The server has no localStorage, so it always renders the signed-out view. */
const serverSnapshot = () => '||';

export function useSession() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [token, role, userJson] = raw.split('|');

  let user = null;
  try {
    user = userJson ? JSON.parse(userJson) : null;
  } catch {
    user = null;
  }

  return { token: token || null, role: role || null, user, signedIn: Boolean(token) };
}
