'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ImagePlus, Loader2, Sparkles, ArrowRight, Infinity as InfinityIcon, RefreshCw, ShieldCheck, Check, Download, X } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import ModelChip from '@/components/ai/ModelChip';

/**
 * AI Studio - the workspace.
 *
 * THE PATTERN, FROM THE REFERENCES
 *   Gemini's image mode: one canvas, a prompt bar along the bottom, the model
 *   chosen from a chip inside that bar. Shopify Magic's media editor: open a
 *   photo, first action is "remove background", then a prompt, then STYLE
 *   CHIPS (Minimal, Vibrant, Natural, Urban, Refined) so nobody has to write
 *   a sentence to get a look. This is those two: a photo on the left, the
 *   result on the right, one bar underneath with what to do, a style, the
 *   words, and which model - and the limits written right there.
 *
 * WHAT IS ON THE SCREEN AND WHY
 *   - Source: drop a photo, or pick one of your own products. Nothing else
 *     is accepted, because the AI works on a real product and the server only
 *     takes our own images anyway.
 *   - Result beside it, captioned with the MODEL and PROVIDER that made it and
 *     the quality band. A picture with no provenance is what makes people
 *     distrust the whole feature.
 *   - The bar: action (white background / in use / describe), a style row,
 *     the prompt, the model chip, Make. The chip shows what is left; spent
 *     models are disabled with the reason and the return time.
 *   - Today, in the corner: this account's allowance (infinity when exempt)
 *     and the exempt account's toggle to live under seller limits.
 *   - A strip of today's results underneath. Any of them can be sent to a
 *     product or downloaded.
 */
const ACTIONS = [
  { key: 'clean', label: 'White background', hint: 'Listing-ready. Amazon wants this for the main photo.' },
  { key: 'lifestyle', label: 'Show it in use', hint: 'On a person, a table, a bed - as a shopper would see it.' },
  { key: 'custom', label: 'Describe it', hint: 'Your own scene, in your own words.' },
];

/*
 * Shopify Magic's style set, in its words, with the one-line prompt each
 * one becomes. Chosen ON TOP of the action: "in use" + "Vibrant" is a
 * bright lifestyle scene; "describe" + "Refined" adds the finish to
 * whatever the seller typed.
 */
const STYLES = [
  { key: 'none', label: 'No style', prompt: '' },
  { key: 'minimal', label: 'Minimal', prompt: 'minimal, clean, lots of negative space, soft neutral tones' },
  { key: 'vibrant', label: 'Vibrant', prompt: 'vibrant, saturated colours, bright cheerful light' },
  { key: 'natural', label: 'Natural', prompt: 'natural daylight, organic textures, warm and honest' },
  { key: 'urban', label: 'Urban', prompt: 'urban street setting, concrete and glass, editorial' },
  { key: 'refined', label: 'Refined', prompt: 'refined luxury, soft studio light, premium editorial finish' },
  { key: 'festive', label: 'Festive', prompt: 'Indian festive mood, warm diya light, marigold and silk tones' },
];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => reject(new Error(`${file.name} could not be read as a photo.`));
    img.src = url;
  });

export default function Studio({ base = '/seller' }) {
  const [catalog, setCatalog] = useState(null);
  const [products, setProducts] = useState([]);
  const [source, setSource] = useState(null); // { src, kind: 'new'|'existing', name }
  const [action, setAction] = useState('clean');
  const [style, setStyle] = useState('none');
  const [wish, setWish] = useState('');
  const [modelId, setModelId] = useState('auto');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const inputRef = useRef(null);

  const loadCatalog = () => authedFetch(`${base}/ai/catalog`).then(setCatalog).catch((e) => setError(e.message));

  useEffect(() => {
    let cancelled = false;
    authedFetch(`${base}/ai/catalog`).then((d) => !cancelled && setCatalog(d)).catch((e) => !cancelled && setError(e.message));
    authedFetch(`${base === '/admin' ? '/seller' : base}/products`)
      .then((d) => !cancelled && setProducts((d.products || d || []).filter((p) => p.images?.length)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [base]);

  const editModels = (catalog?.models || []).filter((m) => m.can.includes('edit'));
  const usage = catalog?.usage;

  const addFile = async (file) => {
    if (!file?.type?.startsWith('image/')) return setError('That is not a photo.');
    try {
      setSource({ src: await readAsDataUrl(file), kind: 'new', name: 'product' });
      setResult(null);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  };

  const make = async () => {
    if (!source) return setError('Add a photo first.');
    if (action === 'custom' && !wish.trim()) return setError('Describe the picture you want.');
    setBusy(true);
    setError('');
    try {
      /*
       * How action + style + words become one request:
       *   clean            -> mode 'clean', no prompt (style is hidden for it)
       *   lifestyle        -> mode 'lifestyle'; with a style, mode 'custom' with
       *                       "shown in natural use, <style>" so the style lands
       *   describe         -> mode 'custom' with the words, style appended
       * The server prepends "keep the product unchanged" to every one.
       */
      const styleText = STYLES.find((s) => s.key === style)?.prompt || '';
      let mode = action;
      let prompt;
      if (action === 'custom') {
        prompt = [wish.trim(), styleText].filter(Boolean).join(', ');
      } else if (action === 'lifestyle' && styleText) {
        mode = 'custom';
        prompt = `shown in natural use in a real setting, ${styleText}`;
      }
      const body = {
        mode,
        productName: source.name,
        ...(prompt ? { prompt } : {}),
        ...(modelId !== 'auto' ? { modelId } : {}),
        ...(source.kind === 'new' ? { imageDataUrl: source.src } : { imageUrl: source.src }),
      };
      const r = await authedFetch(`${base}/ai/image`, { method: 'POST', body });
      const item = { ...r, at: Date.now(), action, style, sourceSrc: source.src };
      setResult(item);
      setHistory((h) => [item, ...h].slice(0, 12));
      loadCatalog();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      {/* ------------------------------------------------------------ */}
      {/* THE CANVAS                                                     */}
      {/* ------------------------------------------------------------ */}
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Source */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addFile(e.dataTransfer.files?.[0]);
            }}
            className="relative aspect-square overflow-hidden rounded-2xl border bg-muted/40"
          >
            {source ? (
              <>
                <Image src={source.src} alt="" fill unoptimized className="object-contain" sizes="50vw" />
                <button
                  type="button"
                  onClick={() => {
                    setSource(null);
                    setResult(null);
                  }}
                  aria-label="Remove photo"
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <X className="size-4" />
                </button>
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Your photo</span>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <ImagePlus className="size-8 text-brand-ink" />
                <p className="text-sm font-medium">Drop a product photo here</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
                    Choose a file
                  </Button>
                  {products.length > 0 && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setPickOpen((o) => !o)}>
                      From my products
                    </Button>
                  )}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    addFile(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </div>

          {/* Result */}
          <div className="relative aspect-square overflow-hidden rounded-2xl border bg-muted/40">
            {busy ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-brand-ink" />
                Making it…
              </div>
            ) : result ? (
              <>
                <Image src={result.url} alt="" fill unoptimized className="object-contain" sizes="50vw" />
                <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                  {result.modelLabel} · {result.providerLabel} · {result.quality}
                </span>
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <ArrowRight className="size-4" /> The result appears here
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Product picker */}
        {pickOpen && (
          <div className="rounded-xl border p-3">
            <p className="mb-2 text-sm font-medium">Pick one of your products</p>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {products.slice(0, 32).map((p) => (
                <li key={p._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSource({ src: p.images[0], kind: 'existing', name: p.name });
                      setResult(null);
                      setPickOpen(false);
                    }}
                    className="relative block aspect-square w-full overflow-hidden rounded-lg border hover:ring-2 hover:ring-primary/40"
                    title={p.name}
                  >
                    <Image src={p.images[0]} alt={p.name} fill unoptimized className="object-cover" sizes="80px" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---------------------------------------------------------- */}
        {/* THE BAR                                                      */}
        {/* ---------------------------------------------------------- */}
        <div className="rounded-2xl border bg-card p-3 shadow-xs">
          <div className="flex flex-wrap gap-1.5">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setAction(a.key)}
                title={a.hint}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  action === a.key ? 'border-primary bg-primary/10 text-brand-ink' : 'hover:bg-accent'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          {action !== 'clean' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {STYLES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStyle(s.key)}
                  className={`rounded-full px-2.5 py-1 text-xs transition ${
                    style === s.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  make();
                }
              }}
              rows={1}
              maxLength={400}
              disabled={action !== 'custom'}
              placeholder={
                action === 'custom'
                  ? 'A model wearing these, side profile, warm evening light…'
                  : action === 'clean'
                    ? 'White studio background - nothing to type'
                    : 'Shown in use - pick a style above, or switch to Describe it'
              }
              className="min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <ModelChip models={editModels} value={modelId} onChange={setModelId} disabled={busy} />
            <Button type="button" onClick={make} disabled={busy || !source} className="h-9 rounded-full px-4">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Make
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>

        {/* Result actions */}
        {result && !busy && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a href={result.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 hover:bg-accent">
              <Download className="size-4" /> Open full size
            </a>
            <button
              type="button"
              onClick={() => setSource({ src: result.url, kind: 'existing', name: source?.name || 'product' })}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 hover:bg-accent"
            >
              <RefreshCw className="size-4" /> Use as new source
            </button>
            <span className="text-muted-foreground">
              Add it to a product from the product&rsquo;s photos - it is saved in your drafts.
            </span>
          </div>
        )}

        {/* Today's results */}
        {history.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-medium">Made today</p>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {history.map((h) => (
                <li key={h.at}>
                  <button
                    type="button"
                    onClick={() => setResult(h)}
                    className={`relative block aspect-square w-full overflow-hidden rounded-lg border ${result?.at === h.at ? 'ring-2 ring-primary' : ''}`}
                    title={`${h.modelLabel} · ${h.providerLabel}`}
                  >
                    <Image src={h.url} alt="" fill unoptimized className="object-cover" sizes="80px" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------ */}
      {/* TODAY                                                          */}
      {/* ------------------------------------------------------------ */}
      <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Today</p>
          {usage ? (
            <dl className="mt-2 space-y-1.5 text-sm">
              {[
                ['Photos', usage.remaining.images, usage.caps?.imagesPerSellerPerDay],
                ['Premium', usage.remaining.premiumImages, usage.caps?.premiumPerSellerPerDay],
                ['Drafts', usage.remaining.texts, usage.caps?.textsPerSellerPerDay],
              ].map(([l, left, cap]) => (
                <div key={l} className="flex items-baseline justify-between">
                  <dt className="text-muted-foreground">{l}</dt>
                  <dd className="font-medium">
                    {left == null ? <InfinityIcon className="inline size-4" /> : left}
                    {cap != null && <span className="text-xs font-normal text-muted-foreground"> / {cap}</span>}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          )}
          {catalog?.canToggleLimits && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={async () => {
                try {
                  const r = await authedFetch(`${base}/ai/limits`, { method: 'PATCH', body: { likeSeller: !catalog.limitsLikeSeller } });
                  setCatalog((c) => ({ ...c, limitsLikeSeller: r.limitsLikeSeller, usage: r.usage }));
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              <ShieldCheck className="size-4" />
              {catalog.limitsLikeSeller ? 'Seller limits on - turn off' : 'Use seller limits on me'}
            </Button>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Models</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {editModels.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2">
                <span className={m.available ? '' : 'text-muted-foreground line-through'}>{m.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {m.available ? (m.unlimited ? '∞' : m.remaining ?? <Check className="inline size-3" />) : 'spent'}
                </span>
              </li>
            ))}
          </ul>
          <Link href={`${base}/ai/limits`} className="mt-3 block text-xs text-brand-ink hover:underline">
            All providers, limits and reset times
          </Link>
        </div>
      </aside>
    </div>
  );
}
