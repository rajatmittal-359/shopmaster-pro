'use client';

import { useEffect, useState } from 'react';
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
const QA = (r) => [
  ['When do I get paid?', `${r.payoutAfterDeliveryDays} days after each delivery - that is the customer's return window. Payments shows every rupee and the reason for any deduction.`],
  ['How fast must I ship?', `Within ${r.dispatchDays} working days of the order. The order page books the courier in one tap; the rider collects from your pickup address.`],
  ['Can I cancel an order?', `Yes, but it costs trust. ${r.cancelFreePer30Days} cancels a month are free; each one after that is ₹${r.cancelPenalty}, deducted from the next payout. Above ${r.cancelRateReviewPct}% of orders, the account is reviewed.`],
  ['A customer wants to return - what happens?', `They have ${r.returnWindowDays} days. The pickup rider brings the label. When it reaches you, settle it from the order: refund, or send the replacement free.`],
  ['A customer says the parcel never came, but the courier says delivered.', `That is a dispute. You have ${r.disputeResponseHours} hours to add your side (the courier's proof, photos). An admin decides - not the customer, not you.`],
  ['What does the platform charge?', `${r.defaultCommissionPct}% of the item price on each delivered order, shown per line on Payments. Nothing on shipping, nothing monthly, no listing fee.`],
  ['Why is my product not on Google?', 'Open the product: the score at the top lists the three things Google and shoppers read first. Google itself takes days to weeks after that.'],
  ['Do I need a GST number?', 'No. Sellers below the threshold sell without one; add it in Payments if you have one and want it on invoices.'],
];

export default function Help({ business }) {
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
        <PanelCard title="The rules, in one screen" lead={`Seller Agreement v${r.version}. The full text is on the selling policy page; these are the numbers that matter day to day.`}>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Ship within', `${r.dispatchDays} working days`],
              ['Paid', `${r.payoutAfterDeliveryDays} days after delivery`],
              ['Commission', `${r.defaultCommissionPct}% of item price`],
              ['Returns window', `${r.returnWindowDays} days`],
              ['Free cancels', `${r.cancelFreePer30Days} a month, then ₹${r.cancelPenalty}`],
              ['Dispute answer', `${r.disputeResponseHours} hours`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b py-1.5 last:border-0 sm:last:border-b">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            <Link href="/selling-policy" className="text-brand-ink hover:underline" target="_blank">
              Read the full agreement
            </Link>
            {settings?.agreement?.acceptedAt ? ` · you accepted v${settings.agreement.version} on ${new Date(settings.agreement.acceptedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </p>
        </PanelCard>

        <PanelCard title="Questions sellers ask">
          <dl className="divide-y">
            {QA(r).map(([q, a]) => (
              <div key={q} className="py-3">
                <dt className="text-sm font-medium">{q}</dt>
                <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
              </div>
            ))}
          </dl>
        </PanelCard>
      </div>

      <div className="space-y-6">
        <PanelCard title="Talk to a person" lead="A small team in Jaipur, same time zone as you.">
          <ul className="space-y-2 text-sm">
            <li>
              <a href={wa} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-ink hover:underline">
                WhatsApp the platform
              </a>
              <span className="block text-xs text-muted-foreground">Fastest. Mention your order number if there is one.</span>
            </li>
            <li>
              <a href={`mailto:${BUSINESS.email}?subject=${encodeURIComponent('Seller question')}`} className="font-medium text-brand-ink hover:underline">
                {BUSINESS.email}
              </a>
              <span className="block text-xs text-muted-foreground">For anything with attachments - invoices, screenshots.</span>
            </li>
            <li>
              <a href={BUSINESS.phoneHref} className="font-medium text-brand-ink hover:underline">
                {BUSINESS.phone}
              </a>
              <span className="block text-xs text-muted-foreground">{BUSINESS.hours}</span>
            </li>
          </ul>
        </PanelCard>

        <PanelCard title="Where things are">
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
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </PanelCard>
      </div>
    </div>
  );
}
