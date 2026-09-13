'use client';

import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import HI from '@/lib/i18n.hi';

/**
 * Hindi for the seller panel - the smallest thing that works.
 *
 * WHY NOT A LIBRARY
 *   The person running Charming Jewels day to day reads Hindi first and
 *   uses a phone; the panel was English only. next-intl would mean an
 *   install this machine cannot do, a routing change and a key for every
 *   string. This is one hook: `t('Orders')` returns the Hindi when the
 *   dictionary has it and the English otherwise - so a page is never
 *   broken by a missing translation, only less translated.
 *
 * THE KEY IS THE ENGLISH
 *   No invented ids. The dictionary in i18n.hi.js is English → Hindi, and
 *   the English stays the source of truth in the code. Interpolation is
 *   `{name}` placeholders in both.
 *
 * WHERE THE CHOICE LIVES
 *   localStorage `smp_lang` ('hi' | 'en'), read through useSyncExternalStore
 *   so the server renders English and the browser swaps without a mismatch.
 *   The toggle sits in the panel's top bar.
 */
const KEY = 'smp_lang';
const listeners = new Set();

const read = () => {
  try {
    return localStorage.getItem(KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
};
const subscribe = (fn) => {
  listeners.add(fn);
  const onStorage = (e) => e.key === KEY && fn();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
};

export const setLang = (lang) => {
  try {
    localStorage.setItem(KEY, lang === 'hi' ? 'hi' : 'en');
  } catch {
    /* private mode: the choice lasts the page */
  }
  listeners.forEach((fn) => fn());
};

export const useLang = () => useSyncExternalStore(subscribe, read, () => 'en');

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k]))) : s);

/** `t('Orders')` or `t('{n} of {total} left', { n, total })`. */
export const useT = () => {
  const lang = useLang();
  // Hindi is the SELLER panel's. The admin panel and the storefront stay
  // English whatever the toggle says - the choice is remembered, not spread.
  const pathname = usePathname() || '';
  const on = lang === 'hi' && (pathname === '/seller' || pathname.startsWith('/seller/'));
  return (en, vars) => fill(on && HI[en] ? HI[en] : en, vars);
};
