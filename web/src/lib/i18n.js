'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Three ways people here read and talk - one choice, used everywhere.
 *
 *   hi  हिंदी     Devanagari. The shopkeeper's language.
 *   hg  Hinglish  Hindi in roman letters, the way WhatsApp is written:
 *                 "Namaste, aap kaise hain". Rajat's own register, and most
 *                 of the sellers we will recruit.
 *   en  English - and "as written": a Hinglish question under this chip
 *       gets a Hinglish answer, an English one an English answer. Only the
 *       first two pin the script (Rajat, 13 Sep).
 *
 * Rajat (13 Sep 2026): "har jagah jaha bhi language ki baat hai ye option
 * chip ki tarah dikha do - app pe, AI ke input/output pe". So the same
 * three codes drive the panel's labels (this file), the assistant's answer
 * language and script, what the mic writes (Devanagari / roman / English)
 * and which voice reads answers aloud. Add a language: a dictionary file
 * and one entry in LANGS.
 *
 * WHY NOT A LIBRARY
 *   next-intl would mean an install this machine cannot do, a routing
 *   change and a key for every string. This is one hook: `t('Orders')`
 *   returns the translation when the dictionary has it and the English
 *   otherwise - a page is never broken by a missing line, only less
 *   translated. Hinglish falls back to English (nav words are the same
 *   words people say), so its dictionary holds only the sentences.
 *
 * WHERE THE CHOICE LIVES
 *   localStorage `smp_lang`, read through useSyncExternalStore so the
 *   server renders English and the browser swaps without a mismatch.
 */
export const LANGS = [
  { code: 'hi', label: 'हिंदी', short: 'हिं', speech: 'hi-IN', name: 'Hindi (Devanagari)' },
  { code: 'hg', label: 'Hinglish', short: 'Hinglish', speech: 'hi-IN', name: 'Hinglish (Hindi in roman letters)' },
  { code: 'en', label: 'English', short: 'EN', speech: 'en-IN', name: 'English' },
];
const CODES = new Set(LANGS.map((l) => l.code));

/*
 * THE DICTIONARIES ARRIVE WHEN THEY ARE NEEDED, NOT BEFORE (15 Oct 2026)
 *
 *   They used to be `import HI from './i18n.hi'` at the top of this file -
 *   107 KB of Devanagari and 70 KB of Hinglish, 177 KB of source. This file
 *   is a client module, so everything that reaches it carries them; and what
 *   reaches it is NotificationBell, which sits in the shared header. The
 *   chain ran root layout -> Header -> NotificationBell -> here, so every
 *   shopper on the storefront downloaded the seller panel's Hindi, in a
 *   52 KB compressed chunk measured on the live site.
 *
 *   Nobody could ever read it there. `useT` below turns translation on only
 *   for a non-English choice ON /seller - the storefront and the admin panel
 *   are English by design. So the bytes were not merely unused, they were
 *   unusable.
 *
 *   Now the chosen dictionary is fetched on the first render that actually
 *   wants it. English needs none at all, which is every customer. The cost
 *   is one extra request the first time a seller switches language, and a
 *   moment of English before it lands - on a panel whose own labels they
 *   already know, that is a better trade than a tax on every shopper.
 */
const DICT = { en: {} };
/*
 * Bumped when a dictionary lands, so the snapshot below changes and the
 * components that asked for it re-render with the words in place.
 */
let rev = 0;
const pending = new Set();

const KEY = 'smp_lang';
const listeners = new Set();

const ensureDict = (lang) => {
  if (lang === 'en' || DICT[lang] || pending.has(lang)) return;
  pending.add(lang);
  const load = lang === 'hi' ? import('@/lib/i18n.hi') : import('@/lib/i18n.hg');
  load
    .then((m) => {
      DICT[lang] = m.default || {};
      rev += 1;
      listeners.forEach((fn) => fn());
    })
    // A dictionary that will not load leaves the panel in English, which is
    // the same fallback a missing line already gets. Never a blank screen.
    .catch(() => {})
    .finally(() => pending.delete(lang));
};

const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return CODES.has(v) ? v : 'en';
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
    localStorage.setItem(KEY, CODES.has(lang) ? lang : 'en');
  } catch {
    /* private mode: the choice lasts the page */
  }
  listeners.forEach((fn) => fn());
};

export const useLang = () => useSyncExternalStore(subscribe, read, () => 'en');

/*
 * The language AND how many dictionaries have landed. `useLang` cannot carry
 * the second half - it is a public hook that other callers compare against
 * 'hi' - so `useT` watches this instead, and re-renders when the words arrive.
 */
const snapshot = () => `${read()}|${rev}`;

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k]))) : s);

/** `t('Orders')` or `t('{n} of {total} left', { n, total })`. */
export const useT = () => {
  const lang = useSyncExternalStore(subscribe, snapshot, () => 'en|0').split('|')[0];
  // Translated labels are the SELLER panel's. The admin panel and the
  // storefront stay English whatever the toggle says - the choice is
  // remembered (and drives the assistant and the mic there), not spread
  // over pages that were written for English.
  const pathname = usePathname() || '';
  const on = lang !== 'en' && (pathname === '/seller' || pathname.startsWith('/seller/'));
  // The fetch starts from an effect, never from the render, so the first
  // paint is never waiting on a network call.
  useEffect(() => {
    if (on) ensureDict(lang);
  }, [on, lang]);
  const dict = DICT[lang] || {};
  return (en, vars) => fill(on && dict[en] ? dict[en] : en, vars);
};
