'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Sparkles, X, Check, Loader2, Wand2, Crop, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react';
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
 *   White background, shown in use, another angle, or the seller's own scene.
 *   The result is a preview beside the original with Use / Discard. The
 *   original is never replaced by the AI; if the seller wants it gone they
 *   remove it themselves. That is the human in the loop.
 */
const MAX = 5;
const MAX_MB = 5;

const AI_MODES = [
  { key: 'clean', label: 'White background', hint: 'Listing-ready studio shot' },
  { key: 'lifestyle', label: 'Show it in use', hint: 'On a person, a table, a bed' },
  { key: 'angle', label: 'Another angle', hint: 'A second view for the gallery' },
];

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

export default function MediaManager({ photos, onChange, productName, onUsage, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(null); // { index, mode }
  const [preview, setPreview] = useState(null); // { fromIndex, url, tier }
  const [custom, setCustom] = useState(null); // { index, text }
  const [cropping, setCropping] = useState(null); // index
  const [dragFrom, setDragFrom] = useState(null);
  const [over, setOver] = useState(false);

  const room = MAX - photos.length;

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    if (files.length > room) return onError(`Five photographs at most - room for ${room} more.`);
    const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) return onError(`${tooBig.name} is over ${MAX_MB}MB. Shrink it and try again.`);
    try {
      const encoded = await Promise.all(files.map(readAsDataUrl));
      onChange([...photos, ...encoded.map((src) => ({ src, kind: 'new' }))]);
      onError('');
    } catch (err) {
      onError(err.message);
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
      const body = { mode, productName, ...(wish ? { prompt: wish } : {}) };
      if (photo.kind === 'new') body.imageDataUrl = photo.src;
      else body.imageUrl = photo.src;
      const result = await authedFetch('/seller/ai/image', { method: 'POST', body });
      setPreview({ fromIndex: index, url: result.url, tier: result.tier });
      if (result.usage) onUsage?.(result.usage);
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
          <ImagePlus className="size-6 text-brand-ink" />
          <span className="text-sm font-medium">Drop photos here, or click to choose</span>
          <span className="text-xs text-muted-foreground">
            JPEG, PNG or WebP · up to {MAX_MB}MB each · square works best · {room} more
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

      {/* THE SLOTS. Five, always shown, so the seller can see what is empty. */}
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {Array.from({ length: MAX }).map((_, i) => {
          const photo = photos[i];
          if (!photo) {
            return (
              <li
                key={`empty-${i}`}
                className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground"
              >
                {i === 0 ? 'Main' : i + 1}
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
                AI · {preview.tier === 'premium' ? 'premium' : 'standard'} quality
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
