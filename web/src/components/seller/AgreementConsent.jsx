'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiBase } from '@/lib/api';

/**
 * The checkbox nobody sells without.
 *
 * Amazon, Flipkart and Meesho all put the agreement before the first
 * listing. This asks for it on both roads to becoming a seller (registering
 * as one, applying from an existing account), sends the version it showed so
 * a stale tab cannot accept last year's terms, and the server refuses
 * without it (authController.agreementRefusal).
 *
 * The rulebook's numbers are pulled live so the line under the box quotes
 * the same figures the agreement page and the payout code use.
 */
export default function AgreementConsent({ checked, onChange, onVersion }) {
  const [rules, setRules] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/public/seller-rules`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setRules(data);
        onVersion?.(data.version);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [onVersion]);

  return (
    <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
        aria-describedby="agreement-summary"
      />
      <span>
        <strong>
          I have read and agree to the{' '}
          <Link href="/selling-policy" target="_blank" rel="noopener" className="text-brand-ink underline">
            Seller Agreement{rules?.version ? ` (v${rules.version})` : ''}
          </Link>
        </strong>
        <span id="agreement-summary" className="mt-1 block text-muted-foreground">
          {rules
            ? `In short: dispatch within ${rules.dispatchDays} business days · cancelling an accepted order is free ${rules.cancelFreePer30Days} times a month, then ₹${rules.cancelPenalty} · ${rules.returnWindowDays}-day returns · payouts ${rules.payoutAfterDeliveryDays} days after delivery · ${rules.defaultCommissionPct}% commission, no GST added.`
            : 'Dispatch times, cancellation charges, returns, disputes, payouts and commission - all in one page.'}
        </span>
      </span>
    </label>
  );
}
