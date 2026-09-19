'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GA_ID, PIXEL_ID } from '@/lib/analytics';
import { setConsent, useConsent, useConsentOpen, useOnRealHost } from '@/lib/consent';

/**
 * The cookie choice (19 Sep 2026).
 *
 * REFERENCE
 *   Shopify's own privacy banner and Amazon.de's cookie bar: a card at the
 *   bottom that does not block the page, two buttons of equal weight, one
 *   line of plain words, a link to the notice. No wall, no "manage 47
 *   partners", no pre-ticked boxes - the DPDP Act 2023 reads a nudge as no
 *   consent, and Baymard finds a modal here costs more visitors than any
 *   tag brings back.
 *
 * WHEN IT SHOWS
 *   Only when there is something to ask about: a GA4 ID or a Meta Pixel ID
 *   is set, the host is real, and no choice is on record - or the footer's
 *   "Cookie choices" reopened it. Nothing configured means no bar at all;
 *   a shop with no trackers has nothing to ask.
 *
 * Above the bottom tab bar on phones (bottom-16), a card at bottom-left on
 * a laptop, out of the way of the sticky buy bar and the toaster.
 */
export default function ConsentBanner() {
  const realHost = useOnRealHost();
  const choice = useConsent();
  const open = useConsentOpen();

  if (!realHost || !(GA_ID || PIXEL_ID)) return null;
  if (choice && !open) return null;

  return (
    <section
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-[4.5rem] z-40 rounded-xl border border-border bg-card p-4 text-sm text-card-foreground shadow-lg md:inset-x-auto md:bottom-4 md:left-4 md:max-w-sm"
    >
      <p>
        We use cookies to see which pages help and, if you allow it, to show
        you our products again elsewhere. Sign-in and cart cookies work either
        way.{' '}
        <Link href="/privacy#cookies" className="underline underline-offset-2">
          How we use them
        </Link>
      </p>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => setConsent('necessary')}>
          Only necessary
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={() => setConsent('all')}>
          Accept all
        </Button>
      </div>
    </section>
  );
}
