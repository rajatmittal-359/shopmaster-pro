'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { useT } from '@/lib/i18n';
import PanelCard from '@/components/panel/PanelCard';

/**
 * The shop's Google readiness, on Grow (plan 2.32).
 *
 * Two lists a seller can act on today: the products Google reads worst
 * (score under 80, weakest first, each with its first fix and a link into
 * the form), and the four "near me" facts local results are ranked on -
 * location shown, city named in About, pickup address, Business Profile
 * linked. Reference: Etsy's shop-level listing quality and Google's own
 * Business Profile completeness meter.
 */
const Fact = ({ ok, label, href, fixLabel }) => (
  <li className="flex items-center gap-2 py-1.5 text-sm">
    {ok ? <Check className="size-4 text-emerald-600" aria-hidden /> : <X className="size-4 text-destructive" aria-hidden />}
    <span className={ok ? '' : 'font-medium'}>{label}</span>
    {!ok && href && <Link href={href} className="ml-auto text-xs text-brand-ink hover:underline">{fixLabel}</Link>}
  </li>
);

export default function GoogleReadiness() {
  const t = useT();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    authedFetch('/seller/google/readiness')
      .then((r) => !cancelled && setD(r))
      .catch((e) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PanelCard title={t('How Google reads your shop')} lead={t('Score out of 100 per product. Under 80 = Google is missing a fact. Fix the lowest first.')}>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!d && !err && <p className="text-sm text-muted-foreground">{t('Reading…')}</p>}
      {d && (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-sm">
              <b>{d.products.avg}</b>/100 {t('average across {n} products', { n: d.products.total })}
              {d.faqsMissing > 0 && <span className="text-muted-foreground"> · {t('{n} without two Q&As', { n: d.faqsMissing })}</span>}
            </p>
            {d.products.weak.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('Every product is 80 or above. Keep new ones there.')}</p>
            ) : (
              <ul className="mt-2 divide-y">
                {d.products.weak.map((p) => (
                  <li key={p._id} className="py-2 text-sm">
                    <Link href={`/seller/products/${p._id}`} className="font-medium hover:underline">{p.name}</Link>
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-200">{p.score}</span>
                    <p className="text-xs text-muted-foreground">{t(p.topFix)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-sm font-medium">{t('"Near me" - what local results rank on')}</p>
            <ul className="mt-1 divide-y">
              <Fact ok={d.nearMe.showLocation} label={t('Your city shown on your shop page')} href="/seller/settings" fixLabel={t('Fix')} />
              <Fact ok={d.nearMe.cityInAbout} label={t('Your city named in your About')} href="/seller/settings" fixLabel={t('Fix')} />
              <Fact ok={d.nearMe.pickupSet} label={t('Pickup address saved')} href="/seller/settings" fixLabel={t('Fix')} />
              <Fact ok={d.nearMe.gbpLinked} label={t('Google Business Profile linked')} href="/seller/settings" fixLabel={t('Fix')} />
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t('Then: reviews + one post a week on the Business Profile (guide below).')}</p>
          </div>
        </div>
      )}
    </PanelCard>
  );
}
