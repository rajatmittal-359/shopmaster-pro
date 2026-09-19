'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { PIXEL_ID } from '@/lib/analytics';
import { useConsent, useOnRealHost } from '@/lib/consent';

/**
 * The Meta Pixel, loaded only after "Accept all" (19 Sep 2026).
 *
 * WHY IT EXISTS BEFORE ANY AD IS BOUGHT
 *   Retargeting ("show my bangles again to the people who looked") and
 *   lookalike audiences are built from what the pixel has already seen. A
 *   pixel installed the day the first ad is planned has an empty audience;
 *   one installed at launch has months of it. Ads themselves are a decision
 *   for later, and cost money; the pixel is free and only records.
 *
 * WHY NOT THE COPY-PASTE SNIPPET
 *   Meta's snippet is a queue stub plus a script tag. The stub is written
 *   here in plain JavaScript and the script is `next/script`, so the pixel
 *   never runs before the visitor has said yes, and `fbq('consent','revoke')`
 *   stops it the moment they change their mind in the footer. PageView goes
 *   per route, like GA4's page_view, for the same App Router reason.
 *
 * Silent without NEXT_PUBLIC_META_PIXEL_ID, on localhost, and for every
 * visitor who has not chosen "Accept all".
 */
const stub = () => {
  if (window.fbq) return;
  const n = function fbq() {
    if (n.callMethod) n.callMethod.apply(n, arguments); // fbevents.js reads the Arguments object
    else n.queue.push(arguments);
  };
  window.fbq = n;
  window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
};

export default function MetaPixel() {
  const pathname = usePathname();
  const realHost = useOnRealHost();
  const consent = useConsent();
  const allowed = Boolean(PIXEL_ID) && realHost && consent === 'all';

  useEffect(() => {
    if (!PIXEL_ID || !realHost) return;
    if (!allowed) {
      // Was loaded earlier in this session and the visitor changed their mind.
      if (window.fbq) window.fbq('consent', 'revoke');
      return;
    }
    stub();
    if (!window.__smpPixel) {
      window.__smpPixel = true;
      window.fbq('init', PIXEL_ID);
    }
    window.fbq('consent', 'grant');
  }, [allowed, realHost]);

  useEffect(() => {
    if (!allowed || typeof window.fbq !== 'function') return;
    window.fbq('track', 'PageView');
  }, [allowed, pathname]);

  if (!allowed) return null;

  // No <noscript> pixel: without JavaScript there is no consent choice either.
  return <Script src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" />;
}
