'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_ID } from '@/lib/analytics';

/**
 * Loads gtag.js once and sends a page_view on every client-side navigation.
 *
 * gtag's own automatic page_view fires once per full load; in an App Router
 * site the next twenty pages are client transitions it never sees. So the
 * config is told `send_page_view: false` and this component sends one per
 * pathname change, the way Next's own third-parties helper does (which is
 * not installed here - rule: no npm install on this machine).
 *
 * Renders nothing, loads nothing, when the measurement ID is empty - and on
 * localhost, so a day of building pages never counts as forty visitors.
 */

const isLocal = () => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
// Read through useSyncExternalStore so the server renders "off" and the
// browser decides - no hydration mismatch, no tag in localhost HTML.
const noop = () => () => {};
const useOnRealHost = () => useSyncExternalStore(noop, () => !isLocal(), () => false);

export default function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const realHost = useOnRealHost();

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

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { send_page_view: false, anonymize_ip: true });`}
      </Script>
    </>
  );
}
