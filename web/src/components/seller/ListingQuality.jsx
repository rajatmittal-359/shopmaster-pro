'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/client';
import { scoreListing } from '@/lib/listingScore';
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

export default function ListingQuality({ form, photos, productId, categoryLabel, needsSize, textModel, onAddTags }) {
  const listing = useMemo(
    () => ({ ...form, images: photos.map((p) => p.src), category: form.category, needsSize }),
    [form, photos, needsSize]
  );
  const { score, fixes } = useMemo(() => scoreListing(listing), [listing]);
  const [kw, setKw] = useState(null); // { keywords, titleTip, writtenBy }
  const [kwBusy, setKwBusy] = useState(false);
  const [google, setGoogle] = useState(null);

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
  const bar = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-destructive';
  const missing = (kw?.keywords || []).filter((k) => !k.present && !(form.tags || []).includes(k.word));

  return (
    <section className="rounded-xl border bg-card p-5">
      {/* 1 · score + fixes */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Listing quality</p>
          <p className={`text-3xl font-semibold tabular-nums ${tone}`}>
            {score}
            <span className="text-base font-normal text-muted-foreground">/100</span>
          </p>
        </div>
        <div className="min-w-40 flex-1">
          <div className="h-2 overflow-hidden rounded bg-muted">
            <div className={`h-full transition-all ${bar}`} style={{ width: `${score}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {score >= 80 ? 'Google and shoppers have what they need. Higher still ranks higher.' : 'Each fix says how many points it is worth. Above 80 is where listings start to show up.'}
          </p>
        </div>
      </div>

      {fixes.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {fixes.slice(0, 3).map((f) => (
            <li key={f.key}>
              <button type="button" onClick={() => jump(f.field)} className="group flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left hover:bg-accent/60">
                <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 text-xs font-medium tabular-nums text-brand-ink">+{f.points}</span>
                <span className="group-hover:text-foreground">{f.text}</span>
              </button>
            </li>
          ))}
          {fixes.length > 3 && <li className="px-2 text-xs text-muted-foreground">and {fixes.length - 3} smaller things.</li>}
        </ul>
      )}

      {/* 2 · search words */}
      <div className="mt-4 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">What people type to find this</p>
          <Button type="button" size="sm" variant="outline" onClick={suggest} disabled={kwBusy || !form.name}>
            {kwBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {kw ? 'Suggest again' : 'Suggest search words'}
          </Button>
        </div>
        {!kw && <p className="mt-1 text-xs text-muted-foreground">The AI reads the title, colour and category and lists the phrases shoppers actually use. Missing ones can be added to your search words in one tap.</p>}
        {kw && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {kw.keywords.map((k) => {
                const have = k.present || (form.tags || []).includes(k.word);
                return have ? (
                  <span key={k.word} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-800 dark:text-emerald-200">
                    <Check className="size-3" /> {k.word}
                  </span>
                ) : (
                  <button
                    key={k.word}
                    type="button"
                    onClick={() => onAddTags([k.word])}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs hover:border-primary hover:text-brand-ink"
                    title="Add to search words"
                  >
                    <Plus className="size-3" /> {k.word}
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
            <p className="mt-1 text-[11px] text-muted-foreground">By {kw.writtenBy}. Green = already in your title or description.</p>
          </>
        )}
      </div>

      {/* 3 · how Google shows it */}
      {form.name && (
        <div className="mt-4 border-t pt-4">
          <p className="text-sm font-medium">How it looks in Google</p>
          <div className="mt-2 rounded-lg border bg-background p-3">
            <p className="truncate text-[15px] text-[#1a0dab] dark:text-[#8ab4f8]">{form.name}{categoryLabel ? ` | ${categoryLabel.split(' → ').pop()}` : ''} | ShopMaster Pro</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">www.shopmasterpro.in › products › {String(form.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {form.price ? `₹${Number(form.price).toLocaleString('en-IN')} · ` : ''}
              {plain(form.description).slice(0, 150) || 'The first line of your description appears here.'}
            </p>
          </div>
        </div>
      )}

      {/* 4 · Google's verdicts, saved products only */}
      {productId && google && (
        <div className="mt-4 border-t pt-4 text-sm">
          <p className="font-medium">Google, right now</p>
          <ul className="mt-2 space-y-1">
            <li className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">Indexed:</span>
              {google.index.indexed === true && <span className="text-emerald-700 dark:text-emerald-300">yes{google.index.lastCrawl ? ` · last crawled ${new Date(google.index.lastCrawl).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}</span>}
              {google.index.indexed === false && <span>not yet{google.index.state ? ` · ${google.index.state}` : ''}. Google finds new pages within a few weeks; a complete listing is indexed sooner.</span>}
              {google.index.indexed === null && <span className="text-muted-foreground">unknown{google.index.reason ? ` (${google.index.reason})` : ''}</span>}
            </li>
            <li className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">Google Shopping:</span>
              {google.merchant.status === 'approved' && <span className="text-emerald-700 dark:text-emerald-300">approved</span>}
              {google.merchant.status === 'disapproved' && <span className="text-destructive">disapproved</span>}
              {!['approved', 'disapproved'].includes(google.merchant.status) && <span className="text-muted-foreground">{google.merchant.status}</span>}
            </li>
            {google.merchant.issues?.map((i) => (
              <li key={i.code} className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                {i.text}{i.detail ? ` - ${i.detail}` : ''}{' '}
                {i.help && (
                  <a href={i.help} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
                    how to fix <ExternalLink className="size-3" />
                  </a>
                )}
              </li>
            ))}
            {google.queries.length > 0 && (
              <li>
                <span className="text-muted-foreground">People typed:</span>{' '}
                {google.queries.slice(0, 5).map((q) => `“${q.query}” (${q.impressions}× shown, position ${q.position})`).join(' · ')}
              </li>
            )}
            {google.queries.length === 0 && <li className="text-xs text-muted-foreground">Not shown in any Google search in the last 28 days. The score above is how that changes.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
