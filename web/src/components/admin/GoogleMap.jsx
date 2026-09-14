'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, Minus } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import PanelCard from '@/components/panel/PanelCard';

/**
 * The admin's Google map (15 Sep 2026 - Rajat: "andar ki duniya, bahar ki
 * duniya - classification"). Two lists: what the CODE does for every
 * seller on every page (nothing to set up), and what only the admin's own
 * Google account can do (consoles, one-time, with a link). Status where an
 * API can tell it; a date where a person did it.
 */
const INSIDE = [
  ['Product · Offer · AggregateRating · MerchantReturnPolicy · ShippingDetails · FAQPage · Breadcrumb · Video schema', 'Stars, price, returns, delivery and Q&A readable by Google and AI answers, on every product page'],
  ['OnlineStore / Organization + sameAs (Instagram, Justdial, Business Profile)', 'One identity for the brand - knowledge panel, brand searches'],
  ['Sitemap on the shop domain, robots, canonicals, title templates, manifest', 'Every page known to Google; iPhone Home Screen install'],
  ['Merchant Center feed /api/feed/google.xml + promotions.txt (nightly)', 'Free Shopping listings for every approved product; coupon tags'],
  ['Search Console, GA4, PageSpeed, Merchant API, Market insights read by the server', 'The Google page here, the seller\'s Grow page, the keyword coach'],
  ['GA4 tag, Google Customer Reviews opt-in, Google sign-in', 'Traffic, the rating badge later, one-tap login'],
  ['Google coach for sellers: readiness score, G/S keyword chips, Q&A drafts, near-me facts', 'Sellers do the right work without being taught SEO'],
  ['Hinglish search + product vectors', 'Shoppers typing "lal jhumka" find red earrings - on ShopMaster, not Google, but the same sale'],
];

const OUTSIDE = [
  { task: 'Search Console - property verified, service account added', done: true, when: '12 Sep', href: 'https://search.google.com/search-console', next: 'Submit the new domain\'s sitemap at cutover' },
  { task: 'Merchant Center - products approved, Merchant API live, promotions feed', done: true, when: '13 Sep', href: 'https://merchants.google.com', next: 'Link the Business Profile once Charming Jewels\' is live' },
  { task: 'GA4 property + tag, linked to Search Console and Merchant Center', done: true, when: '13 Sep', href: 'https://analytics.google.com', next: null },
  { task: 'Google Cloud - APIs enabled, service-account key, OAuth consent screen', done: true, when: '13 Sep', href: 'https://console.cloud.google.com', next: 'Publish the consent screen at launch' },
  { task: 'Postmaster Tools, Google Alerts', done: true, when: '13 Sep', href: 'https://postmaster.google.com', next: null },
  { task: 'Bing Webmaster Tools (import from Search Console)', done: false, when: null, href: 'https://www.bing.com/webmasters', next: 'ChatGPT, Copilot and Perplexity read Bing - the free door into AI answers' },
  { task: 'Google Business Profile - Charming Jewels, with Mummy, from the seller account', done: false, when: null, href: 'https://business.google.com', next: 'Then Merchant Center → Linked accounts → Business Profile' },
];

export default function GoogleMap() {
  const [live, setLive] = useState(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([authedFetch('/admin/google/products').catch(() => null), authedFetch('/admin/google/traffic').catch(() => null)])
      .then(([p, t]) => !cancelled && setLive({ merchant: p?.summary || null, building: p?.building, ga4: t?.ok ? t : null }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <PanelCard title="Inside - the code does this for every seller" lead="Nothing to set up. Listed so nobody buys a tool for it.">
        <ul className="divide-y text-sm">
          {INSIDE.map(([what, gives]) => (
            <li key={what} className="flex gap-2 py-2">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium">{what}</span>
                <span className="block text-xs text-muted-foreground">{gives}</span>
              </span>
            </li>
          ))}
        </ul>
        {live && (
          <p className="mt-3 text-xs text-muted-foreground">
            Live: Merchant Center {live.merchant ? `${live.merchant.approved ?? '?'} approved` : live.building ? 'reading…' : 'unavailable'} · GA4 {live.ga4 ? `${live.ga4.sessions} sessions / ${live.ga4.days} days` : 'unavailable'}
          </p>
        )}
      </PanelCard>
      <PanelCard title="Outside - only the admin's Google account can" lead="One-time console work. Done dates from the ops log; the two open ones are the next wins.">
        <ul className="divide-y text-sm">
          {OUTSIDE.map((o) => (
            <li key={o.task} className="flex gap-2 py-2">
              {o.done ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : <Minus className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className={o.done ? '' : 'font-medium'}>{o.task}</span>
                {o.when && <span className="ml-1 text-xs text-muted-foreground">· {o.when}</span>}
                {o.next && <span className="block text-xs text-muted-foreground">{o.done ? 'Next: ' : ''}{o.next}</span>}
              </span>
              <a href={o.href} target="_blank" rel="noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Open ${o.task}`}>
                <ExternalLink className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}
