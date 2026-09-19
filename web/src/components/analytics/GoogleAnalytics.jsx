'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_ID } from '@/lib/analytics';
import { readConsent, useConsent, useOnRealHost } from '@/lib/consent';

/**
 * Loads gtag.js once and sends a page_view on every client-side navigation.
 *
 * gtag's own automatic page_view fires once per full load; in an App Router
 * site the next twenty pages are client transitions it never sees. So the
 * config is told `send_page_view: false` and this component sends one per
 * pathname change, the way Next's own third-parties helper does (which is
 * not installed here - rule: no npm install on this machine).
 *
 * THE QUEUE IS BUILT HERE, NOT IN AN INLINE SCRIPT (19 Sep 2026)
 *   gtag() is only `dataLayer.push(arguments)`; gtag.js replays the queue in
 *   order when it arrives. Doing the consent default, `js` and `config`
 *   pushes in a mount effect - before the page_view effect below - means the
 *   first page view of a full load is queued in the right order instead of
 *   racing an inline script that had not run yet.
 *
 * CONSENT MODE v2
 *   Google's own answer to a cookie choice: the tag starts with every
 *   storage type `denied`, which means no cookie is written and the page
 *   views go as cookieless pings (counted, modelled, never tied to a
 *   person). "Accept all" in the ConsentBanner flips them to `granted`, and
 *   GA then behaves as before. So the shop still knows roughly how many
 *   came even when nobody clicks the bar, without setting a single cookie
 *   before being allowed to.
 *
 * Renders nothing, loads nothing, when the measurement ID is empty - and on
 * localhost, so a day of building pages never counts as forty visitors.
 */
function gtag() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(arguments); // gtag.js needs the Arguments object, not an array
}
const consentOf = (choice) => {
  const v = choice === 'all' ? 'granted' : 'denied';
  return { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v };
};

export default function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const realHost = useOnRealHost();
  const consent = useConsent();

  useEffect(() => {
    if (!GA_ID || !realHost || window.gtag) return;
    gtag('consent', 'default', consentOf(readConsent()));
    gtag('js', new Date());
    gtag('config', GA_ID, { send_page_view: false, anonymize_ip: true });
    window.gtag = gtag;
  }, [realHost]);

  useEffect(() => {
    if (!GA_ID || !realHost || typeof window.gtag !== 'function') return;
    window.gtag('consent', 'update', consentOf(consent));
  }, [consent, realHost]);

  useEffect(() => {
    if (!GA_ID || !realHost || typeof window.gtag !== 'function') return;
    const query = searchParams?.toString();
    window.gtag('event', 'page_view', {
      page_path: query ? `${pathname}?${query}` : pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname, searchParams, realHost]);

  if (!GA_ID || !realHost) return null;

  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />;
}
