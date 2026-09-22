'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, X } from 'lucide-react';
import { authedFetch } from '@/lib/client';

const KEY = 'smp_2fa_bar_off';

/**
 * The admin account should have two-step sign-in (22 Sep 2026; Shopify made it
 * mandatory for staff in 2024 - the admin login is money and every seller's
 * data). The API is built and drilled; Rajat's decision the same morning was
 * to enrol at the END of the project, with the other cleanup (key rotation,
 * test data). So this bar says it ONCE and can be put away - the house rule is
 * raise it once, then drop it, not nag for weeks. It never locks the panel.
 * When the day comes: /account → Two-step sign-in → Set up.
 */
export default function TwoStepRequired() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const off = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
    authedFetch('/auth/me')
      .then((d) => { if (!cancelled && d.user?.role === 'admin' && !d.user?.totp?.enabled && !off()) setShow(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!show) return null;
  const hide = () => {
    setShow(false);
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* fine */ }
  };
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">Two-step sign-in is ready for this account.</span>
      <span className="text-amber-900/80 dark:text-amber-200/80">Two minutes with an authenticator app, whenever you want it.</span>
      <Link href="/account" className="ml-auto font-medium underline underline-offset-2">Set it up</Link>
      <button type="button" onClick={hide} aria-label="Hide this notice" className="grid size-6 place-items-center rounded-full hover:bg-amber-200/60 dark:hover:bg-amber-900/60">
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
