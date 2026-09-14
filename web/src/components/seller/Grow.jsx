'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PanelCard from '@/components/panel/PanelCard';
import GoogleReadiness from '@/components/seller/GoogleReadiness';
import { useT } from '@/lib/i18n';

/**
 * Get found on Google - the seller's workspace for the outside world.
 *
 * WHY THIS PAGE EXISTS
 *   Everything done for Charming Jewels in September 2026 - Search Console,
 *   Merchant Center, the feed, GA4, structured data, GBP, reviews - took the
 *   admin two evenings in twelve browser tabs. A second seller cannot repeat
 *   that and should not have to. So the page splits the work honestly:
 *   what the PLATFORM already does for every shop (nothing to do), and the
 *   ten things only the SELLER can do, in the order they pay off, each with
 *   the benefit, the two-minute how, and the button that goes there.
 *
 * NOTHING SELF-REPORTED
 *   Every tick comes from the seller's own data (controllers/growController).
 *   A checklist a person ticks themselves is a checklist nobody trusts.
 */
const AUTOMATIC = [
  ['Your product pages are built for Google', 'Fast, server-rendered pages with product structured data - price, stock, shipping, returns, your shop as the seller - on every product.'],
  ['Google is told about every page', 'The sitemap updates itself; Search Console and URL Inspection run on the platform account.'],
  ['Your products go to Google Shopping', 'The Merchant Center feed carries every approved listing with Google’s own category for it; the admin watches approvals for you.'],
  ['Your coupons appear in Shopping results', 'Live promotions are sent to Google every night - a discount tag under your product, free.'],
  ['Customers are asked to rate the shop', 'Google Customer Reviews runs after every order; the stars go under the platform’s name in results.'],
  ['Visits are measured', 'Analytics runs on the storefront; you see what Google showed and clicked for your products in the listing panel.'],
];

const GBP_GUIDE = [
  ['Open business.google.com and sign in with the Google account you will keep', 'Use the shop’s own account, not a personal one you might change. This account owns the listing.'],
  ['“Add your business” - type the shop name exactly as on your board', 'Google matches the name on the board to the name online; a mismatch stalls verification.'],
  ['Choose the category “Jewelry store” (or the one that fits) and add “Online retailer” as a second', 'The primary category decides which searches you appear in.'],
  ['Give the shop address if customers can visit; otherwise choose “I deliver to customers” and set your area', 'A home-based seller need not publish an address - a service area works.'],
  ['Add the phone number and, as the website, your shop page link below', 'The website link is how Google connects the listing to your products here.'],
  ['Verify - Google sends a code by video call, phone, or a postcard to the address', 'Video is fastest: they ask to see the board, the inside, and something that proves it is your shop.'],
  ['Add photos: the board, the inside, your five best products', 'Listings with photos get about 40% more direction requests than those without.'],
  ['Set hours, write two sentences in “From the business”, and turn on messaging', 'Hours and a description are the two things people check before they call.'],
  ['Copy the profile link (Share → Copy link) and paste it in Settings → Your shop on the web', 'That is how we connect your shop page and your Google listing.'],
  ['Every week: one photo or a post; every review: a two-line reply', 'Google ranks active listings above quiet ones. Ten minutes a week is enough.'],
];

const REVIEW_MESSAGE = (shop, url) =>
  `Namaste! This is ${shop}. Thank you for your order - hope you loved it. If you have a minute, a short review here helps our small shop more than you know: ${url}\nWith a photo of you wearing it, even better 🙏`;

function Ring({ value }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} className="fill-none stroke-muted" strokeWidth="6" />
      <circle cx="32" cy="32" r={r} className="fill-none stroke-brand-ink transition-all" strokeWidth="6" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} strokeLinecap="round" />
    </svg>
  );
}

/** Essential / Optional / Automatic - one word, one colour, next to the item. */
const Level = ({ level, t }) => {
  if (!level) return null;
  const cls = level === 'essential' ? 'bg-brand-ink/10 text-brand-ink' : level === 'auto' ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'bg-muted text-muted-foreground';
  const word = level === 'essential' ? t('Essential') : level === 'auto' ? t('Automatic') : t('Optional');
  return <span className={`ml-2 rounded px-1.5 py-0.5 align-middle text-[0.6rem] font-semibold uppercase tracking-wide ${cls}`}>{word}</span>;
};

export default function Grow() {
  const t = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/grow')
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="skeleton-in space-y-4" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Could not copy - select and copy it by hand');
    }
  };

  return (
    <div className="space-y-6">
      {/* THE SCORE AND THE ONE NEXT THING */}
      <div className="flex flex-wrap items-center gap-5 rounded-xl border bg-card p-5">
        <div className="relative">
          <Ring value={data.score} />
          <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">{data.score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {data.done} of {data.total} steps done
          </p>
          {data.next ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Next, about {data.next.minutes} min: <strong className="text-foreground">{data.next.title}</strong>
              {' - '}
              {data.next.progress}.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">Everything a seller can do is done. Keep the weekly habits below.</p>
          )}
        </div>
        {data.next && (
          <Button render={<Link href={data.next.href} />} nativeButton={false}>
            Do it
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {/* Plan 2.32: the products Google reads worst, and the near-me facts. */}
          <GoogleReadiness />
          {/* Two worlds (15 Sep 2026): what a seller does HERE and what only they can do ON GOOGLE.
              Each step carries essential/optional; the ticks come from data, never from a checkbox. */}
          <PanelCard title={t('On ShopMaster - you do it here')} lead={t('Ticks come from your own products and settings. Essential first.')}>
            <ol className="divide-y">
              {data.steps.filter((x) => x.world !== 'google').map((s, i) => (
                <li key={s.key} className="flex gap-3 py-3">
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                    {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className={`font-medium ${s.done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''}`}>
                        {t(s.title)}
                        <Level level={s.level} t={t} />
                      </p>
                      <span className="text-xs tabular-nums text-muted-foreground">{s.progress}</span>
                    </div>
                    {!s.done && (
                      <>
                        {s.value > 0 && s.value < 100 && (
                          <div className="mt-1.5 h-1 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-brand-ink" style={{ width: `${s.value}%` }} />
                          </div>
                        )}
                        <p className="mt-1.5 text-sm text-muted-foreground">{s.why}</p>
                        <p className="mt-1 text-sm">
                          <span className="text-muted-foreground">How: </span>
                          {s.how}{' '}
                          <Link href={s.href} className="font-medium text-brand-ink hover:underline">
                            Go →
                          </Link>
                        </p>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </PanelCard>

          <PanelCard title={t('On Google - only you can do this')} lead={t('Outside ShopMaster, from your own Google account. This is where "near me" and Maps are won.')}>
            <ol className="divide-y">
              {data.steps.filter((x) => x.world === 'google').map((s) => (
                <li key={s.key} className="flex gap-3 py-3">
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${s.done ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                    {s.done ? <Check className="size-3.5" strokeWidth={3} /> : '1'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t(s.title)}<Level level={s.level} t={t} /></p>
                    <p className="mt-1 text-sm text-muted-foreground">{s.why}</p>
                    {!s.done && <p className="mt-1 text-sm"><span className="text-muted-foreground">{t('How')}: </span>{s.how} <Link href={s.href} className="font-medium text-brand-ink hover:underline">{t('Go')} →</Link></p>}
                  </div>
                </li>
              ))}
              {(data.outside || []).map((o, i) => (
                <li key={o.task} className="flex gap-3 py-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{i + 2}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t(o.task)}<Level level={o.level} t={t} /></p>
                    <p className="mt-1 text-sm text-muted-foreground">{t(o.gives)}</p>
                    {o.href && <a href={o.href} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-ink hover:underline">{t('Open')} →</a>}
                  </div>
                </li>
              ))}
            </ol>
          </PanelCard>

          <PanelCard title={t('Every field that matters, and what it earns')} lead={t('Essential = Google or the courier needs it. Optional = earns more clicks. Where to fill it, and why.')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">{t('Field')}</th>
                    <th className="pb-2 pr-3 font-medium">{t('Where')}</th>
                    <th className="pb-2 font-medium">{t('Earns')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data.fields || []).map((x) => (
                    <tr key={x.field}>
                      <td className="py-2 pr-3 align-top"><Link href={x.href} className="hover:underline">{t(x.field)}</Link><Level level={x.level} t={t} /></td>
                      <td className="py-2 pr-3 align-top text-muted-foreground">{t(x.where)}</td>
                      <td className="py-2 align-top text-muted-foreground">{t(x.gives)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{t('Never: bought backlinks, keyword stuffing, city names sprinkled in descriptions - Google penalises all three, and at our size they earn nothing.')}</p>
          </PanelCard>

          {/* Market insights (plan 2.20): Google's own view of our prices and the
              week's sellers. Amazon's Product Opportunity Explorer, free, once
              Google has traffic to learn from. Until then the card says so. */}
          <PanelCard title={t('What the market is doing')} lead={t("Google's benchmark price for your products and what sells in your categories this week - free, from Merchant Center.")}>
            {!data.market?.enabled ? (
              <p className="text-sm text-muted-foreground">{t('Google switches this on by itself once the shop has enough clicks - usually a few weeks after launch. Nothing to set up.')}</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium">{t('Your prices vs the market')}</p>
                  {data.market.prices.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t('No benchmark yet for your products.')}</p>
                  ) : (
                    <ul className="mt-2 divide-y text-sm">
                      {data.market.prices.slice(0, 8).map((p) => (
                        <li key={p.productId} className="flex items-center justify-between gap-3 py-1.5">
                          <span className="truncate">{p.name}</span>
                          <span className={`shrink-0 tabular-nums ${p.verdict === 'above' ? 'text-destructive' : p.verdict === 'below' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                            ₹{p.price.toLocaleString('en-IN')} · {p.pct > 0 ? '+' : ''}{p.pct}% {t('vs')} ₹{p.benchmark.toLocaleString('en-IN')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{t('Selling this week in your categories')}</p>
                  {data.market.bestSellers.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">{t('No best-seller list for your categories yet.')}</p>
                  ) : (
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                      {data.market.bestSellers.map((b) => (
                        <li key={`${b.rank}-${b.title}`}><span className="font-medium">{b.title}</span>{b.brand ? ` · ${b.brand}` : ''}{b.priceRange ? ` · ${b.priceRange}` : ''}<span className="block text-xs text-muted-foreground">{b.category}</span></li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>
            )}
          </PanelCard>

          <PanelCard title="Google Business Profile - the ten-minute guide" lead="Your shop on Google Maps and in the box beside a search. Free. Done once, kept alive with a photo a week.">
            <ol className="space-y-3">
              {GBP_GUIDE.map(([step, why], i) => (
                <li key={step} className="flex gap-3 text-sm">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-[0.65rem] font-semibold text-brand-ink">{i + 1}</span>
                  <div>
                    <p>{step}</p>
                    <p className="text-xs text-muted-foreground">{why}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <a href="https://business.google.com/create" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">
                Open Google Business Profile <ExternalLink className="size-3.5" />
              </a>
              <span className="text-muted-foreground">·</span>
              <button type="button" onClick={() => copy(data.shopUrl)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <Copy className="size-3.5" /> copy your shop page link for the “website” field
              </button>
            </div>
          </PanelCard>
        </div>

        <div className="space-y-6">
          <PanelCard title="Already done for you" lead="The platform's side. Nothing to set up.">
            <ul className="space-y-3">
              {AUTOMATIC.map(([t, d]) => (
                <li key={t} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-medium">{t}</p>
                    <p className="text-xs text-muted-foreground">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </PanelCard>

          <PanelCard title="The review message" lead="Send after delivery, on WhatsApp, with the product link. Change the words to yours.">
            <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">{REVIEW_MESSAGE(data.businessName || 'our shop', data.shopUrl)}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(REVIEW_MESSAGE(data.businessName || 'our shop', data.shopUrl))}>
              Copy message
            </Button>
          </PanelCard>

          <PanelCard title="Once a week, ten minutes">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>· One new photo or post on your Google listing and Instagram.</li>
              <li>· Reply to every review, ours and Google’s - two lines, by name.</li>
              <li>· Open the weakest product and fix its three things.</li>
              <li>· Check Performance: cancels, dispatch time, failed deliveries.</li>
            </ul>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
