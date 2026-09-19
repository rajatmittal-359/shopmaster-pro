'use client';

import { useSyncExternalStore } from 'react';

/**
 * The visitor's cookie choice (19 Sep 2026).
 *
 * WHY A COOKIE AND NOT localStorage
 *   The API has to know it too: the server-side Purchase event to Meta
 *   (backend utils/metaCapi) must not leave for a visitor who chose "Only
 *   necessary", and the API sees cookies, not a browser's storage. One
 *   plain cookie, `smp_consent`, readable by both sides. It is not personal
 *   data itself and needs no consent of its own.
 *
 * VALUES
 *   'all'        analytics and advertising tags may run
 *   'necessary'  only what the shop needs to work (sign-in, cart, theme)
 *   null         not asked yet, or the answer expired - treated as 'necessary'
 *
 * DPDP Act 2023: consent is free, specific, informed, and as easy to withdraw
 * as to give. So both buttons weigh the same, and "Cookie choices" in the
 * footer reopens the bar at any time.
 */
export const CONSENT_COOKIE = 'smp_consent';
const ONE_YEAR = 365 * 24 * 60 * 60;

let reopen = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const readConsent = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=(all|necessary)(?:;|$)`));
  return m ? m[1] : null;
};

export const setConsent = (value) => {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
  reopen = false;
  notify();
};

/** The footer's "Cookie choices" - shows the bar again so a choice can be changed. */
export const openConsent = () => {
  reopen = true;
  notify();
};

/** 'all' | 'necessary' | null; null on the server so nothing loads in the HTML. */
export const useConsent = () => useSyncExternalStore(subscribe, readConsent, () => null);
export const useConsentOpen = () => useSyncExternalStore(subscribe, () => reopen, () => false);

/** True when advertising and analytics tags may run. */
export const marketingAllowed = () => readConsent() === 'all';

/**
 * False on localhost, so a day of building pages never counts as forty
 * visitors and no bar asks the developer anything. Read through
 * useSyncExternalStore so the server renders "off" and the browser decides -
 * no hydration mismatch, no tag in localhost HTML.
 */
const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
const never = () => () => {};
export const useOnRealHost = () => useSyncExternalStore(never, () => !isLocal(), () => false);
