'use client';

import { useEffect } from 'react';
import Script from 'next/script';

/**
 * The band at the top of My orders right after checkout, and Google's
 * survey opt-in with it.
 *
 * WHY A BAND ON THE LIST AND NOT A SEPARATE PAGE
 *   Checkout already lands here; the order it just made is the first row.
 *   Amazon's "Order placed, thanks" and Flipkart's confirmation both do the
 *   same job - say it worked, show the number, point at the next thing.
 *
 * GOOGLE CUSTOMER REVIEWS (Merchant Center programme)
 *   The opt-in is Google's own module: a small "Get a survey from Google
 *   about this order?" - the customer decides. Enough answers earn the
 *   seller-rating stars under our name in Shopping and Search, which is the
 *   trust signal Flipkart and Myntra carry and a new marketplace lacks.
 *   Renders only when NEXT_PUBLIC_GCR_MERCHANT_ID is set (after Rajat enables
 *   the programme) and only for the order just placed - never for old ones.
 *   Fields per support.google.com/merchants/answer/14629205.
 */
const GCR_ID = process.env.NEXT_PUBLIC_GCR_MERCHANT_ID || '';

const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

export default function OrderPlaced({ order, email }) {
  // The date the checkout quoted (standard delivery now carries one too,
  // 20 Sep 2026). Google's opt-in still needs SOME date, so the week-out
  // guess survives only for that field - never printed to the customer.
  const eta = order.deliveryPromisedBy || null;
  const gcrDate = eta || (order.createdAt && new Date(new Date(order.createdAt).getTime() + 7 * 86400000).toISOString()) || null;

  useEffect(() => {
    if (!GCR_ID || !email) return;
    window.renderOptIn = () => {
      window.gapi?.load('surveyoptin', () => {
        window.gapi.surveyoptin.render({
          merchant_id: Number(GCR_ID),
          order_id: order.orderNumber || String(order._id),
          email,
          delivery_country: 'IN',
          estimated_delivery_date: isoDate(gcrDate || order.createdAt),
          opt_in_style: 'BOTTOM_RIGHT_DIALOG',
        });
      });
    };
    // If platform.js is already on the page (a second order this session),
    // onload will not fire again - call it ourselves.
    if (window.gapi) window.renderOptIn();
  }, [order._id, order.orderNumber, order.createdAt, email, gcrDate]);

  return (
    <>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
        {/* E3: the moment. The circle pops, the tick draws itself - 700 ms, once, then still. */}
        <svg viewBox="0 0 24 24" className="pop-in mt-0.5 size-6 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path className="draw-check" d="M7.5 12.5l3 3 6-6.5" />
        </svg>
        <div className="text-sm">
          <p className="font-medium">Order placed. Thank you.</p>
          <p className="mt-0.5 text-muted-foreground">
            {order.orderNumber ? `${order.orderNumber} · ` : ''}
            {eta
              ? `arriving by ${new Date(eta).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}. `
              : ''}
            We will email you when it ships.
          </p>
        </div>
      </div>
      {GCR_ID && email && (
        <Script src="https://apis.google.com/js/platform.js?onload=renderOptIn" strategy="afterInteractive" />
      )}
    </>
  );
}
