'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PartyPopper, X } from 'lucide-react';
import { useT } from '@/lib/i18n';

/**
 * The first sale, marked once (E3, 22 Sep 2026).
 *
 * Shopify's "Your first sale!" and Etsy's first-order note are the moment a
 * new seller decides the shop is real. One card above the dashboard the
 * first time the order list has exactly one order, a small burst of dots in
 * the brand colours (CSS, 900 ms, none under reduced motion), and a link to
 * pack it. Dismissed, it never returns - remembered per order id in this
 * browser, so the phone and the laptop each see it once at most.
 */
const DOTS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  const r = 46 + (i % 3) * 14;
  return { dx: `${Math.cos(angle) * r}px`, dy: `${Math.sin(angle) * r}px`, tone: i % 3 };
});
const TONES = ['bg-primary', 'bg-brand-rose', 'bg-amber-400'];

export default function FirstSale({ order }) {
  const t = useT();
  const key = order ? `smp_first_sale_${order._id}` : null;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!key) return;
    // Read after the first paint (a promise), so the effect body sets no state itself.
    const seen = () => { try { return localStorage.getItem(key); } catch { return null; } };
    Promise.resolve().then(() => { if (!seen()) setShow(true); });
  }, [key]);

  if (!order || !show) return null;

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(key, String(Date.now())); } catch { /* fine */ }
  };

  return (
    <div role="status" className="pop-in relative overflow-hidden rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <span aria-hidden className="burst pointer-events-none absolute left-8 top-8 block size-0">
        {DOTS.map((d, i) => <i key={i} className={TONES[d.tone]} style={{ '--dx': d.dx, '--dy': d.dy, animationDelay: `${i * 12}ms` }} />)}
      </span>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-brand-ink">
          <PartyPopper className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold">{t('Your first sale!')}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('Somebody chose your shop. Pack it well, ship on time, and the review that follows brings the next one.')}
          </p>
          <Link href={`/seller/orders?tab=pack`} className="mt-2 inline-block text-sm font-medium text-brand-ink hover:underline">
            {t('Pack the order')} →
          </Link>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('Dismiss')} className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent">
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
