'use client';

/**
 * The platform's monthly bill for its commission (plan 2.85): one row per
 * month that charged something, each opening the printable document.
 * Amazon, Flipkart and Meesho all give sellers this; it is what an
 * accountant asks for.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { useT } from '@/lib/i18n';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const monthName = (m) => new Date(`${m}-15T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function CommissionBills() {
  const t = useT();
  const [months, setMonths] = useState(null);

  useEffect(() => {
    let live = true;
    authedFetch('/seller/commission-invoices')
      .then((r) => live && setMonths(r.months || []))
      .catch(() => live && setMonths([]));
    return () => {
      live = false;
    };
  }, []);

  if (!months) return null;

  return (
    <section className="mt-8 rounded-xl border border-border p-4">
      <h2 className="font-semibold">{t('Commission bills')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('One bill a month for what the platform kept from your payouts - the document your accountant will ask for.')}</p>
      {months.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('No bills yet. One appears after the first month in which a payout kept a commission.')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {months.map((m) => (
            <li key={m.month} className="flex items-center justify-between py-2">
              <Link href={`/seller/payments/commission/${m.month}`} className="text-brand-ink hover:underline">
                {monthName(m.month)}
              </Link>
              <span className="tabular-nums">{money(m.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
