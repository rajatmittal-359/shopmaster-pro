'use client';

import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import HI from '@/lib/i18n.hi';
import HG from '@/lib/i18n.hg';

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
const DICT = { hi: HI, hg: HG, en: {} };

const KEY = 'smp_lang';
const listeners = new Set();

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

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? `{${k}}` : String(vars[k]))) : s);

/** `t('Orders')` or `t('{n} of {total} left', { n, total })`. */
export const useT = () => {
  const lang = useLang();
  // Translated labels are the SELLER panel's. The admin panel and the
  // storefront stay English whatever the toggle says - the choice is
  // remembered (and drives the assistant and the mic there), not spread
  // over pages that were written for English.
  const pathname = usePathname() || '';
  const on = lang !== 'en' && (pathname === '/seller' || pathname.startsWith('/seller/'));
  const dict = DICT[lang] || {};
  return (en, vars) => fill(on && dict[en] ? dict[en] : en, vars);
};
