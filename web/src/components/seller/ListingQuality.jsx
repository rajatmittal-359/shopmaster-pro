'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { scoreListing } from '@/lib/listingScore';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

/**
 * The listing, scored - and the way up.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Amazon's Listing Quality dashboard, Etsy's listing score, Shopify's SEO
 *   preview. One number the seller can push up while typing, the three fixes
 *   worth the most points on top, each a jump to its field. Rajat's brief:
 *   "lalach deke madad" - the score is the carrot, the fixes are the help.
 *
 * FOUR THINGS, ONE CARD
 *   1 the score and the next fixes (live, from the form itself)
 *   2 search words - what a shopper would type, from the AI, with the ones
 *     the listing already carries ticked and the missing ones one tap away
 *   3 what Google will show: a result preview from the title and text
 *   4 for a saved product, Google's own verdicts: indexed? approved in
 *     Merchant Center? and what people typed when it was shown
 *
 * Nothing here is style advice; every line is a thing Google or a shopper
 * reads. The score function is shared with the server (lib/listingScore).
 */
const FIELD_IDS = { name: 'name', description: 'description', images: 'photos', category: 'category', color: 'color', gender: 'gender', size: 'size', brand: 'brand', weight: 'weight', tags: 'tags' };

const plain = (html) => String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export default function ListingQuality({ form, photos, productId, categoryLabel, needsSize, textModel, onAddTags, part = 'bar' }) {
  const listing = useMemo(
    () => ({ ...form, images: photos.map((p) => p.src), category: form.category, needsSize }),
    [form, photos, needsSize]
  );
  const { score, fixes } = useMemo(() => scoreListing(listing), [listing]);
  const [kw, setKw] = useState(null); // { keywords, titleTip, writtenBy }
  const [kwBusy, setKwBusy] = useState(false);
  const [google, setGoogle] = useState(null);
  const [allOpen, setAllOpen] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!productId) return undefined;
    let cancelled = false;
    authedFetch(`/seller/products/${productId}/google`)
      .then((d) => {
        if (!cancelled) setGoogle(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const jump = (field) => {
    const el = document.getElementById(FIELD_IDS[field] || field);
    if (!el) return;
    window.dispatchEvent(new CustomEvent('smp:reveal', { detail: el.id }));
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof el.focus === 'function') setTimeout(() => el.focus({ preventScroll: true }), 300);
  };

  const suggest = async () => {
    setKwBusy(true);
    try {
      const first = photos[0];
      const data = await authedFetch('/seller/ai/keywords', {
        method: 'POST',
        body: {
          name: form.name,
          description: form.description,
          categoryName: categoryLabel,
          color: form.color,
          tags: form.tags,
          imageUrl: first?.kind === 'existing' ? first.src : undefined,
          textModel,
        },
      });
      setKw(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setKwBusy(false);
    }
  };

  const tone = score >= 80 ? 'text-emerald-700 dark:text-emerald-300' : score >= 50 ? 'text-amber-700 dark:text-amber-300' : 'text-destructive';
  const missing = (kw?.keywords || []).filter((k) => !k.present && !(form.tags || []).includes(k.word));

  const band = t(score >= 80 ? 'Great' : score >= 60 ? 'Good' : score >= 35 ? 'Getting there' : 'Not ready');
  const ring = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  const next = fixes[0] || null;

  /*
   * TWO PLACES, ONE COMPONENT (15 Sep 2026, plan 2.39)
   *   part="bar"     the slim health bar at the top of the form: a ring, one
   *                  word, ONE next fix with its points, and "All N" that opens
   *                  the full list. Reference: Amazon's Listing Quality
   *                  Dashboard (prioritised by impact) drawn the way Untitled
   *                  UI draws a progress ring. Rajat, 15 Sep: the old block
   *                  put five things before the form and read as noise.
   *   part="words"   the "Suggest search words" button and the words it
   *                  finds. It sits in 6 · Details, directly under the Search
   *                  words field it fills (27 Sep 2026). It used to live two
   *                  cards away in 8 · Google, writing into a field nobody
   *                  could see - Rajat: "google and search word me confuse hu
   *                  mai". The button moved to the field; the field did not
   *                  move, so nobody has to relearn where it is.
   *   part="preview" the Google result preview, inside 2 · Words, under the
   *                  description it previews.
   *   Google's own VERDICTS are not here at all any more. They were a
   *   paragraph in the form, and Rajat could not read it - "faltu keede
   *   makode chal rahe hain". They now live on the listing's own report page
   *   (components/seller/GoogleStatus), rewritten as three one-line answers;
   *   the bar links to it.
   *
   * WHY THERE IS NO "8 · GOOGLE" CARD ANY MORE (27 Sep 2026)
   *   Rajat: "if something isn't a product filling step then why even it is
   *   here - preview is another thing, it is either show in relevant thing on
   *   side". A numbered card in a numbered sequence promises a step. Section 8
   *   could not be filled, so the number was a lie, and the rail had to carry
   *   a chip with no tick to work around it.
   *
   *   Shopify DOES put a "Search engine listing preview" in its product form -
   *   but theirs earns the place, because it carries editable Page title and
   *   Description overrides. Ours is derived from what the seller already
   *   typed. A preview of a field belongs beside that field; a report of what
   *   Google did belongs with the listing's health, not in the middle of the
   *   work.
   */
  if (part === 'words') {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Not "what people type to find this" any more - that is the
              field's own label, right above this box. This line says what is
              different about the box: these are words with evidence behind
              them, not a second place to type. */}
          <p className="text-sm font-medium">{t('Words people actually typed')}</p>
          <Button type="button" size="sm" variant="outline" onClick={suggest} disabled={kwBusy || !form.name}>
            {kwBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {t(kw ? 'Suggest again' : 'Suggest search words')}
          </Button>
        </div>
        {!kw && <p className="mt-1 text-xs text-muted-foreground">{t('Real searches first (Google, ShopMaster), AI fills the gaps. Tap a word to add it.')}</p>}
        {kw && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {kw.keywords.map((k) => {
                const have = k.present || (form.tags || []).includes(k.word);
                // Where the word came from (plan 2.32): G = Google searchers, S = ShopMaster shoppers, ≈ = same-thing word, AI = suggested.
                const badge = k.source === 'google' ? 'G' : k.source === 'shop' ? 'S' : k.source === 'family' ? '≈' : 'AI';
                const badgeClass = k.source === 'google' ? 'bg-sky-500/15 text-sky-800 dark:text-sky-200' : k.source === 'shop' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200' : 'bg-muted text-muted-foreground';
                const tip = k.note || (k.source === 'ai' ? 'Suggested by AI from the facts' : '');
                return have ? (
                  <span key={k.word} title={tip} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-800 dark:text-emerald-200">
                    <Check className="size-3" /> {k.word}
                    {k.count > 1 && <span className="opacity-70">· {k.count}</span>}
                  </span>
                ) : (
                  <button
                    key={k.word}
                    type="button"
                    onClick={() => onAddTags([k.word])}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs hover:border-primary hover:text-brand-ink"
                    title={tip || 'Add to search words'}
                  >
                    <Plus className="size-3" /> {k.word}
                    <span className={`ml-0.5 rounded px-1 text-[0.6rem] font-semibold ${badgeClass}`}>{badge}{k.count > 1 ? ` ${k.count}` : ''}</span>
                  </button>
                );
              })}
            </div>
            {missing.length > 1 && (
              <button type="button" onClick={() => onAddTags(missing.map((k) => k.word))} className="mt-2 text-xs text-brand-ink hover:underline">
                Add all {missing.length} missing
              </button>
            )}
            {kw.titleTip && <p className="mt-2 text-xs text-muted-foreground">Title: {kw.titleTip}</p>}
            <p className="mt-1 text-[11px] text-muted-foreground">
              <b>Green</b> = already in your listing · <b>G</b> = typed on Google{kw.evidence?.google ? '' : ' (not read yet)'} · <b>S</b> = typed on ShopMaster · <b>≈</b> = same-thing word · <b>AI</b> = {kw.writtenBy} · number = how many times
            </p>
          </>
        )}
      </div>
    );
  }

  /*
   * The preview, under the description that drives it. It stays quiet until
   * there is a name, because an empty Google result teaches nobody anything.
   */
  if (part === 'preview') {
    if (!form.name) return null;
    return (
      <div className="mt-3">
        <p className="text-xs font-medium text-muted-foreground">{t('How it looks in Google')}</p>
        <div className="mt-1.5 rounded-lg border bg-background p-3">
          <p className="truncate text-[15px] text-[#1a0dab] dark:text-[#8ab4f8]">{form.name}{categoryLabel ? ` | ${categoryLabel.split(' → ').pop()}` : ''} | ShopMaster Pro</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">www.shopmasterpro.in › products › {String(form.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {form.price ? `₹${Number(form.price).toLocaleString('en-IN')} · ` : ''}
            {plain(form.description).slice(0, 150) || t('The first line of your description appears here.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-xl border bg-card px-4 py-3 sm:px-5" aria-label={t('Listing health')}>
      <div className="flex items-center gap-4">
        <div className="relative size-14 shrink-0" title={`${score} out of 100`}>
          <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={ring} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} className="transition-all duration-500" />
          </svg>
          <span className={`absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums ${tone}`}>{score}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className={`font-semibold ${tone}`}>{band}</span>
            <span className="text-muted-foreground"> · {t(score >= 80 ? 'Google and shoppers have what they need' : 'above 80 means nothing important is missing')}</span>
          </p>
          {next ? (
            <button type="button" onClick={() => jump(next.field)} className="group mt-1 flex w-full items-center gap-2 text-left text-sm">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Next')}</span>
              <span className="min-w-0 truncate group-hover:underline">{t(next.text)}</span>
              <span className="shrink-0 rounded bg-primary/10 px-1.5 text-xs font-semibold tabular-nums text-brand-ink">+{next.points}</span>
              <span className="shrink-0 text-xs font-medium text-brand-ink">{t('Fix →')}</span>
            </button>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t('Nothing left to fix. Save it.')}</p>
          )}
        </div>
        {fixes.length > 1 && (
          <button type="button" onClick={() => setAllOpen((v) => !v)} aria-expanded={allOpen} className="shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
            {allOpen ? t('Hide') : t('All {n}', { n: fixes.length })}
          </button>
        )}
      </div>
      {allOpen && fixes.length > 0 && (
        <ul className="mt-3 grid gap-1 border-t pt-3 text-sm sm:grid-cols-2">
          {fixes.map((f) => (
            <li key={f.key}>
              <button type="button" onClick={() => jump(f.field)} className="group flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left hover:bg-accent/60">
                <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 text-xs font-medium tabular-nums text-brand-ink">+{f.points}</span>
                <span className="group-hover:text-foreground">{t(f.text)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* The way to everything this bar cannot hold: what the listing sold,
          how often it was opened, and what Google did with it. A score is a
          prediction; the report is the result (plan §4.62). */}
      {productId && (
        <div className="mt-3 border-t pt-2">
          <Link href={`/seller/products/${productId}/report`} className="text-xs font-medium text-brand-ink hover:underline">
            {t('See how this listing is doing →')}
          </Link>
        </div>
      )}
    </section>
  );
}
