'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';

/**
 * The customer's own standing, in their own account (Fair Returns §4.39 D,
 * plan 2.29 - built 15 Sep 2026).
 *
 * An admin can put an account on "prepaid only" or "returns need approval"
 * when its record earns it. The model comment on User.risk says it: a
 * consequence with no reason is a grievance. So the reason the admin typed
 * is shown here, with what it changes and where to object - never
 * discovered for the first time as a refusal at the pay button. Nothing is
 * drawn for a clean account.
 */
const WORDS = {
  warn: { title: 'A note on this account', means: 'Nothing changes for you yet. Returns and claims on this account are looked at a little more closely.' },
  prepaid_only: { title: 'Cash on delivery is not available on this account', means: 'You can still buy anything - pay online at checkout (UPI, cards, netbanking).' },
  returns_approval: { title: 'Returns on this account need a quick approval', means: 'You can still request a return; an admin looks at it before the pickup is booked, usually within a day.' },
};

export default function AccountStanding({ compact = false }) {
  const [risk, setRisk] = useState(null);
  useEffect(() => {
    let cancelled = false;
    authedFetch('/auth/me')
      .then((me) => !cancelled && setRisk(me?.user?.risk || null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!risk || !risk.level || risk.level === 'none' || !WORDS[risk.level]) return null;
  const w = WORDS[risk.level];
  return (
    <div className={`rounded-xl border border-amber-500/40 bg-amber-500/10 ${compact ? 'p-3 text-sm' : 'p-4'}`} role="status">
      <p className="font-medium">{w.title}</p>
      {risk.reason && <p className="mt-1 text-sm">Reason: {risk.reason}</p>}
      <p className="mt-1 text-sm text-muted-foreground">
        {w.means} If you think this is wrong, write to the{' '}
        <Link href="/contact" className="text-brand-ink hover:underline">grievance officer</Link> - every complaint is answered within 48 hours.
      </p>
    </div>
  );
}
