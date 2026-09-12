'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { CheckCircle2 } from 'lucide-react';

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
  // The promised date the server gave; a week out only when it gave none.
  const eta =
    order.deliveryPromisedBy ||
    (order.createdAt && new Date(new Date(order.createdAt).getTime() + 7 * 86400000).toISOString()) ||
    null;

  useEffect(() => {
    if (!GCR_ID || !email) return;
    window.renderOptIn = () => {
      window.gapi?.load('surveyoptin', () => {
        window.gapi.surveyoptin.render({
          merchant_id: Number(GCR_ID),
          order_id: order.orderNumber || String(order._id),
          email,
          delivery_country: 'IN',
          estimated_delivery_date: isoDate(eta || order.createdAt),
          opt_in_style: 'BOTTOM_RIGHT_DIALOG',
        });
      });
    };
    // If platform.js is already on the page (a second order this session),
    // onload will not fire again - call it ourselves.
    if (window.gapi) window.renderOptIn();
  }, [order._id, order.orderNumber, order.createdAt, email, eta]);

  return (
    <>
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
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
