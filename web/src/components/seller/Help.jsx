'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import Link from 'next/link';
import { authedFetch } from '@/lib/client';
import { getSellerRules } from '@/lib/api';
import { BUSINESS as DEFAULT_BUSINESS } from '@/config/policy';
import PanelCard from '@/components/panel/PanelCard';

/**
 * Help & rules - the page every seller panel has and ours did not.
 *
 * Flipkart Seller Hub's Support, Meesho's Help, Seller Central's Help: the
 * rules in plain words, the questions people actually ask, and a way to
 * reach a person. Ours adds the seller's own agreement status, because the
 * first question a new seller has is "what did I sign".
 */
const QA = (r, t) => [
  [t('When do I get paid?'), t("{n} days after each delivery - that is the customer's return window. Payments shows every rupee and the reason for any deduction.", { n: r.payoutAfterDeliveryDays })],
  [t('How fast must I ship?'), t('Within {n} working days of the order. The order page books the courier in one tap; the rider collects from your pickup address.', { n: r.dispatchDays })],
  [t('Can I cancel an order?'), t('Yes, but it costs trust. {free} cancels a month are free; each one after that is ₹{penalty}, deducted from the next payout. Above {pct}% of orders, the account is reviewed.', { free: r.cancelFreePer30Days, penalty: r.cancelPenalty, pct: r.cancelRateReviewPct })],
  [t('A customer wants to return - what happens?'), t('They have {n} days. The pickup rider brings the label. When it reaches you, settle it from the order: refund, or send the replacement free.', { n: r.returnWindowDays })],
  [t('A customer says the parcel never came, but the courier says delivered.'), t("That is a dispute. You have {n} hours to add your side (the courier's proof, photos). An admin decides - not the customer, not you.", { n: r.disputeResponseHours })],
  [t('What does the platform charge?'), t('{n}% of the item price on each delivered order, shown per line on Payments. Nothing on shipping, nothing monthly, no listing fee.', { n: r.defaultCommissionPct })],
  [t('Why is my product not on Google?'), t('Open the product: the score at the top lists the three things Google and shoppers read first. Google itself takes days to weeks after that.')],
  [t('Do I need a GST number?'), t('No. Sellers below the threshold sell without one; add it in Payments if you have one and want it on invoices.')],
];

export default function Help({ business }) {
  const t = useT();
  const BUSINESS = business || DEFAULT_BUSINESS;
  const [rules, setRules] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getSellerRules().then((r) => {
      if (!cancelled) setRules(r);
    });
    authedFetch('/seller/settings')
      .then((d) => {
        if (!cancelled) setSettings(d.settings || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const r = rules || { payoutAfterDeliveryDays: 7, dispatchDays: 2, cancelFreePer30Days: 2, cancelPenalty: 50, cancelRateReviewPct: 5, returnWindowDays: 7, disputeResponseHours: 72, defaultCommissionPct: 8, version: '1.0' };
  const wa = `https://wa.me/${BUSINESS.phoneHref.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I sell on ShopMaster Pro (${settings?.businessName || ''}). `)}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <PanelCard title={t('The rules, in one screen')} lead={t('Seller Agreement v{v}. The full text is on the selling policy page; these are the numbers that matter day to day.', { v: r.version })}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              [t('Ship within'), t('{n} working days', { n: r.dispatchDays })],
              [t('Paid'), t('{n} days after delivery', { n: r.payoutAfterDeliveryDays })],
              [t('Commission'), t('{n}% of item price', { n: r.defaultCommissionPct })],
              [t('Returns window'), t('{n} days', { n: r.returnWindowDays })],
              [t('Free cancels'), t('{n} a month, then ₹{penalty}', { n: r.cancelFreePer30Days, penalty: r.cancelPenalty })],
              [t('Dispute answer'), t('{n} hours', { n: r.disputeResponseHours })],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b py-1.5 last:border-0 sm:last:border-b">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            <Link href="/selling-policy" className="text-brand-ink hover:underline" target="_blank">
              {t('Read the full agreement')}
            </Link>
            {settings?.agreement?.acceptedAt ? ` · ${t('you accepted v{v} on {date}', { v: settings.agreement.version, date: new Date(settings.agreement.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) })}` : ''}
          </p>
        </PanelCard>

        <PanelCard title={t('Questions sellers ask')}>
          <dl className="divide-y">
            {QA(r, t).map(([q, a]) => (
              <div key={q} className="py-3">
                <dt className="text-sm font-medium">{q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </PanelCard>
      </div>

      <div className="space-y-6">
        <PanelCard title={t('Talk to a person')} lead={t('A small team in Jaipur, same time zone as you.')}>
          <ul className="space-y-2 text-sm">
            <li>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-ink hover:underline">
                {t('WhatsApp the platform')}
              </a>
              <span className="block text-xs text-muted-foreground">{t('Fastest. Mention your order number if there is one.')}</span>
            </li>
            <li>
              <a href={`mailto:${BUSINESS.email}?subject=${encodeURIComponent('Seller question')}`} className="font-medium text-brand-ink hover:underline">
                {BUSINESS.email}
              </a>
              <span className="block text-xs text-muted-foreground">{t('For anything with attachments - invoices, screenshots.')}</span>
            </li>
            <li>
              <a href={BUSINESS.phoneHref} className="font-medium text-brand-ink hover:underline">
                {BUSINESS.phone}
              </a>
              <span className="block text-xs text-muted-foreground">{BUSINESS.hours}</span>
            </li>
          </ul>
        </PanelCard>

        <PanelCard title={t('Where things are')}>
          <ul className="space-y-1.5 text-sm">
            {[
              ['/seller/orders', 'Book a courier, mark delivered'],
              ['/seller/issues', 'Returns, disputes, failed deliveries'],
              ['/seller/products/new', 'Add a product - photo first, AI writes the rest'],
              ['/seller/promotions', 'Run a coupon'],
              ['/seller/payments', 'Bank account, payouts, deductions'],
              ['/seller/performance', 'How your account is doing'],
              ['/seller/settings', 'Pickup address, free shipping'],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-brand-ink hover:underline">
                  {t(label)}
                </Link>
              </li>
            ))}
          </ul>
        </PanelCard>
      </div>
    </div>
  );
}
