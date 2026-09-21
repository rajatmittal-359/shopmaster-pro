'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { authedFetch } from '@/lib/client';

/**
 * The admin account must have two-step sign-in (22 Sep 2026; Shopify made it
 * mandatory for staff in 2024 - the admin login is money and every seller's
 * data). Until it is set up, this bar sits above every admin page. It does
 * not lock the panel - a lock at 3 a.m. with nobody awake to enrol is worse
 * than a bar - but it never goes away on its own.
 */
export default function TwoStepRequired() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    authedFetch('/auth/me').then((d) => setMissing(d.user?.role === 'admin' && !d.user?.totp?.enabled)).catch(() => {});
  }, []);
  if (!missing) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">Two-step sign-in is required for the admin account.</span>
      <span className="text-amber-900/80 dark:text-amber-200/80">Takes two minutes with an authenticator app.</span>
      <Link href="/account" className="ml-auto font-medium underline underline-offset-2">Set it up</Link>
    </div>
  );
}
