'use client';

import { useSyncExternalStore } from 'react';

/**
 * The docked assistant's open/minimised state (plan 2.33), shared between
 * the header button and the drawer, remembered across navigation and a
 * reload (sessionStorage). Module-level store, no provider - the same
 * pattern as the session and the language chip.
 */
const KEY = 'smp.assist.dock';
const listeners = new Set();
let state = 'closed'; // 'closed' | 'open' | 'min'

const read = () => state;
const readServer = () => 'closed';
const subscribe = (fn) => {
  listeners.add(fn);
  if (listeners.size === 1) {
    try {
      const saved = sessionStorage.getItem(KEY);
      if (saved && saved !== state) {
        state = saved;
        queueMicrotask(() => listeners.forEach((l) => l()));
      }
    } catch {
      /* private mode */
    }
  }
  return () => listeners.delete(fn);
};

export const setDock = (next) => {
  state = next;
  try {
    sessionStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
};

export const useDock = () => useSyncExternalStore(subscribe, read, readServer);
