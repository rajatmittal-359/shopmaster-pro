'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Sparkles, X, Check, Loader2, Wand2 } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The photographs on a product, each with the AI beside it.
 *
 * WHAT A SELLER SEES
 *   Their photos as thumbnails - the ones already saved and the ones just
 *   picked - and on each one an "Improve" menu with three things it can do:
 *   put it on a white background, show it in use, show another angle. The
 *   result appears as a PREVIEW next to the original with Use / Discard.
 *   Nothing changes until they press Use. That preview is the human in the
 *   loop; the model never touches a listing on its own.
 *
 * WHY THE FIRST ONE IS MARKED
 *   The first photograph is what shows on the card and in search. A seller
 *   who improves photo three and leaves a dim phone shot in position one has
 *   improved nothing anyone sees - so the first slot is labelled, and a
 *   result can be put there directly.
 *
 * THE SELLER'S OWN IDEA
 *   The three presets cover most listings. The fourth option is a box: "a
 *   model wearing these jhumkas, side profile, soft evening light". Their
 *   words go to the model AFTER our rule that the product must not change -
 *   it is their scene, but it is still their product in it.
 *
 * WHY THE ORIGINAL IS NEVER DELETED BY THE AI
 *   "Use" ADDS the result. If the seller wants the original gone they remove
 *   it themselves with the cross. An automatic replacement would be the one
 *   thing that could lose a photo the seller cannot retake.
 */
const MODES = [
  { key: 'clean', label: 'White background', hint: 'Listing-ready studio shot' },
  { key: 'lifestyle', label: 'Show it in use', hint: 'On a person, a table, a bed - as it would be' },
  { key: 'angle', label: 'Another angle', hint: 'A second view for the gallery' },
];

export default function AiPhotoTools({
  photos, // [{ src, kind: 'existing' | 'new' }]
  productName,
  onAccept, // (url, { asFirst }) => void
  onRemove, // (photo) => void
  onUsage, // (usage) => void
}) {
  const [busy, setBusy] = useState(null); // { index, mode }
  const [preview, setPreview] = useState(null); // { fromIndex, url, tier, model }
  const [error, setError] = useState('');
  const [custom, setCustom] = useState(null); // { index, text } while the box is open

  const improve = async (photo, index, mode, wish) => {
    setBusy({ index, mode });
    setError('');
    setPreview(null);
    setCustom(null);
    try {
      const body = { mode, productName, ...(wish ? { prompt: wish } : {}) };
      if (photo.kind === 'existing') body.imageUrl = photo.src;
      else body.imageDataUrl = photo.src;

      const result = await authedFetch('/seller/ai/image', { method: 'POST', body });
      setPreview({ fromIndex: index, url: result.url, tier: result.tier, model: result.model });
      if (result.usage && onUsage) onUsage(result.usage);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (photos.length === 0) return null;

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {photos.map((photo, i) => (
          <li key={`${photo.kind}-${i}`} className="group relative">
            <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {/* Data URLs and remote URLs both go through next/image unoptimised:
                  a base64 string cannot be resized by the server, and a draft
                  thumbnail does not need to be. */}
              <Image src={photo.src} alt="" fill unoptimized className="object-cover" sizes="120px" />
              {i === 0 && (
                <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Main
                </span>
              )}
              {busy?.index === i && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Loader2 className="size-5 animate-spin" />
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center justify-between gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={Boolean(busy)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-brand-ink hover:bg-accent disabled:opacity-50"
                >
                  <Sparkles className="size-3.5" />
                  Improve
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {MODES.map((m) => (
                    <DropdownMenuItem key={m.key} onClick={() => improve(photo, i, m.key)}>
                      <span className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-xs text-muted-foreground">{m.hint}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={() => setCustom({ index: i, text: '' })}>
                    <span className="flex flex-col">
                      <span className="flex items-center gap-1.5">
                        <Wand2 className="size-3.5" />
                        Describe what you want
                      </span>
                      <span className="text-xs text-muted-foreground">
                        &ldquo;A model wearing these, side profile, soft light&rdquo;
                      </span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={() => onRemove(photo)}
                aria-label="Remove this photograph"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {custom && (
        <div className="rounded-xl border bg-muted/40 p-3">
          <label htmlFor="ai-wish" className="text-sm font-medium">
            Describe the picture you want
          </label>
          <Textarea
            id="ai-wish"
            rows={2}
            maxLength={400}
            autoFocus
            value={custom.text}
            onChange={(e) => setCustom({ ...custom, text: e.target.value })}
            placeholder="A model wearing these jhumkas, side profile, warm evening light, festive look"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Say the scene, the person, the light. The product itself is kept exactly as in your photo.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!custom.text.trim()}
              onClick={() => improve(photos[custom.index], custom.index, 'custom', custom.text.trim())}
            >
              <Sparkles className="size-4" />
              Make it
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCustom(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {preview && (
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <figure>
              <div className="relative aspect-square overflow-hidden rounded-lg border">
                <Image src={photos[preview.fromIndex]?.src} alt="" fill unoptimized className="object-cover" sizes="200px" />
              </div>
              <figcaption className="mt-1 text-xs text-muted-foreground">Your photo</figcaption>
            </figure>
            <figure>
              <div className="relative aspect-square overflow-hidden rounded-lg border ring-2 ring-primary/40">
                <Image src={preview.url} alt="" fill unoptimized className="object-cover" sizes="200px" />
              </div>
              <figcaption className="mt-1 text-xs text-muted-foreground">
                AI · {preview.tier === 'premium' ? 'premium' : 'standard'} quality
              </figcaption>
            </figure>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onAccept(preview.url, { asFirst: true });
                setPreview(null);
              }}
            >
              <Check className="size-4" />
              Use as main photo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onAccept(preview.url, { asFirst: false });
                setPreview(null);
              }}
            >
              Add to gallery
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Discard
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Look closely before using it. The AI is told to keep the product exactly as it is - check that it did.
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
