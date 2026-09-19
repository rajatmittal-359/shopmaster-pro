'use client';

import { useSyncExternalStore } from 'react';

/**
 * Who is signed in, on the browser side.
 *
 * WHERE THE SESSION LIVES (19 Sep 2026)
 *   NOT here. The access and refresh tokens are httpOnly cookies the API
 *   sets; no script - ours or an attacker's - can read them (OWASP: never a
 *   token in localStorage). What this store keeps is the DRAWING copy: who
 *   is signed in (name, role) and what they may do, so the header can render
 *   without a round trip. If it is ever wrong, a request answers 401 and the
 *   copy is cleared - the server, not this, decides.
 *
 *   `smp_token` is read but no longer written: a token the old React app
 *   left behind keeps working as a header until it expires, so nobody was
 *   signed out on the day this changed. Signing in here clears it.
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
/*
 * What this account can do, cached for DRAWING ONLY.
 *
 * The server decides authorisation on every request by reading the database -
 * see backend/utils/capabilities.js. This copy exists so the header does not
 * have to wait for a round trip before it knows whether to show a Seller link,
 * and it is refreshed from /auth/me on every load. If it is ever wrong the
 * worst case is a link that answers 403, not access somebody should not have.
 */
const CAPS = 'smp_capabilities';

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

export const setSession = ({ role, user }) => {
  // Cookies carry the session now; a leftover header token is retired.
  write(TOKEN, null);
  write(ROLE, role || null);
  write(USER, user ? JSON.stringify(user) : null);
  // Cleared, not guessed: the next /auth/me says what this account can do.
  write(CAPS, null);
  announce();
};

/** Called after /auth/me answers. */
export const setCapabilities = (capabilities) => {
  write(CAPS, capabilities ? JSON.stringify(capabilities) : null);
  announce();
};

export const clearSession = () => {
  write(TOKEN, null);
  write(ROLE, null);
  write(USER, null);
  write(CAPS, null);
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
const snapshot = () =>
  `${read(TOKEN) || ''}|${read(ROLE) || ''}|${read(USER) || ''}|${read(CAPS) || ''}`;

/** The server has no localStorage, so it always renders the signed-out view. */
const serverSnapshot = () => '|||';

export function useSession() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [token, role, userJson, capsJson] = raw.split('|');

  const parse = (value) => {
    try {
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  };

  const capabilities = parse(capsJson);

  return {
    token: token || null,
    role: role || null,
    user: parse(userJson),
    // Signed in when the drawing copy says so (cookie sessions) or a legacy token is still around.
    signedIn: Boolean(userJson) || Boolean(token),
    /*
     * Until /auth/me has answered, `capabilities` is null and the caller should
     * draw nothing role-specific rather than guess from `role` - guessing is
     * what the old single-role model did, and it is what this change removes.
     */
    capabilities,
    canSell: Boolean(capabilities?.seller),
    isAdmin: Boolean(capabilities?.admin) || role === 'admin',
  };
}
