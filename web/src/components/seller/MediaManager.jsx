'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sparkles, X, Check, Loader2, Wand2, Crop, ChevronLeft, ChevronRight, ImagePlus, Cpu } from 'lucide-react';
import { authedFetch } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhotoCropper from '@/components/seller/PhotoCropper';

/**
 * The photographs on a product: adding, ordering, cropping, improving.
 *
 * THE PATTERN, FROM THE REFERENCES
 *   Shopify: a drop zone, thumbnails in a row, drag to reorder, the first one
 *   is the featured image. Amazon: numbered slots with the first marked MAIN,
 *   a white background required there, the product filling 85% of the frame.
 *   This is those two together, at the size of a shop with five photos.
 *
 * ONE LIST, TWO KINDS
 *   Saved photos are URLs on our Cloudinary; new ones are data URLs still in
 *   the browser; an AI result is a URL in the drafts folder. They live in ONE
 *   ordered list, so "move left" and "make this the main photo" work the same
 *   whatever the photo's origin - and the order the seller sees is the order
 *   that is saved.
 *
 * WHY ARROWS AND NOT ONLY DRAG
 *   Drag-and-drop is here for a mouse. Arrows are here because a phone has no
 *   drag, a keyboard has no drag, and a seller with five photos moves one at
 *   most. Two ways to do a small thing beats one way that fails on the device
 *   most sellers are holding.
 *
 * THE AI IS A MENU ON EACH PHOTO, NOT A SEPARATE PLACE
 *   White background, shown in use, or the seller's own scene. The result is
 *   a preview beside the original with Use / Discard, and the caption names
 *   WHICH model made it. The original is never replaced by the AI; if the
 *   seller wants it gone they remove it themselves. That is the human in the
 *   loop.
 *
 * THE MODEL IS THE SELLER'S TO CHOOSE
 *   "Automatic" lets the server pick the best available. The picker beside it
 *   lists every editing model with what is left today; a model that has hit
 *   its limit is shown but disabled, with the reason. Nothing is hidden about
 *   what is doing the work - that was Rajat's requirement, and it is the
 *   difference between a feature that feels broken when spent and one that
 *   tells you it is spent.
 */
const MAX = 5;

/*
 * Three, and each one traced to a platform that offers it (12 Sep 2026):
 *   White background  Shopify Magic's remove-background; Amazon's main-image
 *                     rule; Meesho-side tools like SellerShip
 *   Show it in use    Amazon Seller Central's own "lifestyle scene" generator;
 *                     Studiofy / Seller7 for Meesho and Flipkart sellers
 *   Describe          Shopify Magic's text-prompted background ("in a sunny
 *                     park, bench under a tree")
 * "Another angle" was here too, and was nobody's - it came from a guess, not
 * a reference, and was removed for exactly that reason.
 */
const AI_MODES = [
  { key: 'clean', label: 'White background', hint: 'Listing-ready studio shot' },
  { key: 'lifestyle', label: 'Show it in use', hint: 'On a person, a table, a bed' },
];

/**
 * A phone photograph straight from the camera is 6-12 MB and 4000px on a
 * side. The server takes 5 MB and the card shows 400px. So instead of telling
 * the seller "too big, shrink it and try again" - which is where a lot of
 * sellers stop - the browser shrinks it here: longest side 2000px, JPEG at
 * 0.88. That is more than any card, gallery or feed will ever ask for, and it
 * turns a 9 MB photo into about 600 KB before it goes anywhere.
 *
 * PNGs with transparency come out on white, which is what a listing wants.
 */
const MAX_SIDE = 2000;
const HARD_LIMIT_MB = 40; // beyond this it is not a photo, it is a mistake

const prepareImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} could not be read as a photo.`));
    };
    img.src = url;
  });

export default function MediaManager({ photos, onChange, productName, onUsage, onError, base = '/seller' }) {
  const inputRef = useRef(null);
  const [catalog, setCatalog] = useState(null); // { models } from /ai/catalog
  const [modelId, setModelId] = useState('auto');

  useEffect(() => {
    let cancelled = false;
    authedFetch(`${base}/ai/catalog`)
      .then((d) => !cancelled && setCatalog(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [base]);

  const editModels = (catalog?.models || []).filter((m) => m.can.includes('edit'));
  const [localError, setLocalError] = useState('');
  const [adding, setAdding] = useState(false);
  // Shown right here, beside the photos, AND passed up: an error about a
  // photo that appears only in the save bar at the bottom is an error nobody
  // sees.
  const say = (message) => {
    setLocalError(message);
    onError?.(message);
  };
  const [busy, setBusy] = useState(null); // { index, mode }
  const [preview, setPreview] = useState(null); // { fromIndex, url, tier }
  const [custom, setCustom] = useState(null); // { index, text }
  const [cropping, setCropping] = useState(null); // index
  const [dragFrom, setDragFrom] = useState(null);
  const [over, setOver] = useState(false);

  const room = MAX - photos.length;

  const addFiles = async (fileList) => {
    const all = Array.from(fileList || []);
    const files = all.filter((f) => f.type.startsWith('image/'));
    if (all.length && files.length === 0) return say('Those are not photos. JPEG, PNG or WebP.');
    if (files.length === 0) return;
    if (files.length > room) return say(`Five photographs at most - room for ${room} more.`);
    const absurd = files.find((f) => f.size > HARD_LIMIT_MB * 1024 * 1024);
    if (absurd) return say(`${absurd.name} is over ${HARD_LIMIT_MB}MB - that is not a photo file.`);
    setAdding(true);
    try {
      const encoded = await Promise.all(files.map(prepareImage));
      onChange([...photos, ...encoded.map((src) => ({ src, kind: 'new' }))]);
      say('');
    } catch (err) {
      say(err.message);
    } finally {
      setAdding(false);
    }
  };

  const move = (from, to) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const remove = (index) => onChange(photos.filter((_, i) => i !== index));

  const improve = async (index, mode, wish) => {
    const photo = photos[index];
    setBusy({ index, mode });
    setPreview(null);
    setCustom(null);
    onError('');
    try {
      const body = {
        mode,
        productName,
        ...(wish ? { prompt: wish } : {}),
        ...(modelId !== 'auto' ? { modelId } : {}),
      };
      if (photo.kind === 'new') body.imageDataUrl = photo.src;
      else body.imageUrl = photo.src;
      const result = await authedFetch(`${base}/ai/image`, { method: 'POST', body });
      setPreview({
        fromIndex: index,
        url: result.url,
        tier: result.tier,
        modelLabel: result.modelLabel,
        providerLabel: result.providerLabel,
        quality: result.quality,
      });
      if (result.usage) onUsage?.(result.usage);
      // The ledger moved; refresh what is left so the picker stays truthful.
      authedFetch(`${base}/ai/catalog`).then(setCatalog).catch(() => {});
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const accept = (asFirst) => {
    const item = { src: preview.url, kind: 'existing' };
    onChange(asFirst ? [item, ...photos] : [...photos, item]);
    setPreview(null);
  };

  return (
    <div className="space-y-4">
      {/* THE DROP ZONE. Also a button, for everyone without a mouse to drag with. */}
      {room > 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            over ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60 hover:bg-accent/40'
          }`}
        >
          {adding ? <Loader2 className="size-6 animate-spin text-brand-ink" /> : <ImagePlus className="size-6 text-brand-ink" />}
          <span className="text-sm font-medium">{adding ? 'Preparing…' : 'Drop photos here, or click to choose'}</span>
          <span className="text-xs text-muted-foreground">
            JPEG, PNG or WebP · any size, large ones are shrunk here · {room} more
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* WHICH MODEL. Automatic by default; every editing model by name,
          with what is left, disabled with a reason when spent. */}
      {editModels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Cpu className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">AI model for edits:</span>
          <Select
            items={{ auto: 'Automatic (best available)', ...Object.fromEntries(editModels.map((m) => [m.id, m.label])) }}
            value={modelId}
            onValueChange={setModelId}
          >
            <SelectTrigger className="h-8 min-w-56" aria-label="AI model for edits">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                <span className="flex flex-col">
                  <span>Automatic</span>
                  <span className="text-xs text-muted-foreground">Best available answers, falls back if one is spent</span>
                </span>
              </SelectItem>
              {editModels.map((m) => (
                <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                  <span className="flex flex-col">
                    <span>
                      {m.label}
                      <span className="ml-1.5 text-xs text-muted-foreground">{m.providerLabel}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {m.available
                        ? m.unlimited
                          ? 'Unlimited'
                          : m.remaining != null
                            ? `${m.remaining} left today`
                            : 'Available'
                        : m.reason}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Link href={`${base}/ai`} className="text-xs text-brand-ink hover:underline">
            All models &amp; limits
          </Link>
        </div>
      )}

      {/* THE SLOTS. Five, always shown, so the seller can see what is empty. */}
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Array.from({ length: MAX }).map((_, i) => {
          const photo = photos[i];
          if (!photo) {
            // An empty slot is a way in, not a placeholder - the seller asked
            // where "add" was when the drop zone was the only door.
            return (
              <li key={`empty-${i}`}>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  aria-label={`Add photo ${i + 1}`}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition hover:border-primary/60 hover:bg-accent/40 hover:text-brand-ink"
                >
                  <ImagePlus className="size-4" />
                  <span className="text-[11px]">{i === 0 ? 'Add main photo' : 'Add'}</span>
                </button>
              </li>
            );
          }
          return (
            <li
              key={`${photo.kind}-${photo.src.slice(0, 40)}-${i}`}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom != null) move(dragFrom, i);
                setDragFrom(null);
              }}
              className="group"
            >
              <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                <Image src={photo.src} alt="" fill unoptimized className="object-cover" sizes="140px" />
                <span
                  className={`absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    i === 0 ? 'bg-primary text-primary-foreground' : 'bg-black/55 text-white'
                  }`}
                >
                  {i === 0 ? 'Main' : i + 1}
                </span>
                {busy?.index === i && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                    <Loader2 className="size-5 animate-spin" />
                  </span>
                )}
              </div>

              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label="Move left"
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === photos.length - 1}
                    aria-label="Move right"
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={Boolean(busy)}
                    aria-label="Edit this photo"
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-brand-ink hover:bg-accent disabled:opacity-50"
                  >
                    <Sparkles className="size-3.5" />
                    Edit
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <DropdownMenuItem onClick={() => setCropping(i)}>
                      <Crop className="size-4" />
                      <span className="flex flex-col">
                        <span>Crop to square</span>
                        <span className="text-xs text-muted-foreground">Fill the frame with the product</span>
                      </span>
                    </DropdownMenuItem>
                    {i !== 0 && (
                      <DropdownMenuItem onClick={() => move(i, 0)}>
                        <Check className="size-4" />
                        Make this the main photo
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {AI_MODES.map((m) => (
                      <DropdownMenuItem key={m.key} onClick={() => improve(i, m.key)}>
                        <Sparkles className="size-4 text-brand-ink" />
                        <span className="flex flex-col">
                          <span>{m.label}</span>
                          <span className="text-xs text-muted-foreground">{m.hint}</span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onClick={() => setCustom({ index: i, text: '' })}>
                      <Wand2 className="size-4 text-brand-ink" />
                      <span className="flex flex-col">
                        <span>Describe what you want</span>
                        <span className="text-xs text-muted-foreground">
                          &ldquo;A model wearing these, side profile&rdquo;
                        </span>
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => remove(i)}>
                      <X className="size-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>

      {localError && <p className="text-sm text-destructive">{localError}</p>}

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
            Say the scene, the person, the light. The product itself stays exactly as in your photo.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!custom.text.trim()}
              onClick={() => improve(custom.index, 'custom', custom.text.trim())}
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
                Made by <span className="text-foreground">{preview.modelLabel}</span>
                {preview.providerLabel ? ` · ${preview.providerLabel}` : ''}
                {preview.quality ? ` · ${preview.quality} quality` : ''}
              </figcaption>
            </figure>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => accept(true)}>
              <Check className="size-4" />
              Use as main photo
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => accept(false)}>
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

      <PhotoCropper
        key={cropping ?? 'closed'}
        open={cropping != null}
        src={cropping != null ? photos[cropping]?.src : null}
        onCancel={(err) => {
          setCropping(null);
          if (err) onError(err.message);
        }}
        onDone={(dataUrl) => {
          const next = [...photos];
          next[cropping] = { src: dataUrl, kind: 'new' };
          onChange(next);
          setCropping(null);
        }}
      />
    </div>
  );
}
