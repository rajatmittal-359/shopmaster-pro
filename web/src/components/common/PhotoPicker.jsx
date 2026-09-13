'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { Camera, X } from 'lucide-react';

/**
 * A few photos as evidence - the customer's "what arrived", the seller's
 * pack proof and "what came back". Phone-first: the button opens the camera
 * on a phone (capture="environment") and the file picker on a laptop. Each
 * photo is shrunk in the browser to 1600px / JPEG 0.85 before it becomes a
 * data URL, so three photos from a 50 MP phone are ~1 MB, not 30.
 *
 * `value` is an array of data URLs; the API takes them as-is
 * (backend utils/evidence uploads and returns Cloudinary URLs).
 */
const shrink = (file, max = 1600) =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file is not a photo'));
    };
    img.src = url;
  });

export default function PhotoPicker({ value = [], onChange, max = 3, label = 'Add a photo', className = '' }) {
  const inputRef = useRef(null);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, max - value.length);
    e.target.value = '';
    const next = [];
    for (const f of files) {
      try {
        next.push(await shrink(f));
      } catch {
        /* skip what is not an image */
      }
    }
    if (next.length) onChange([...value, ...next].slice(0, max));
  };
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {value.map((src, i) => (
        <span key={i} className="relative size-20 overflow-hidden rounded-lg border bg-muted">
          <Image src={src} alt="" fill sizes="80px" className="object-cover" unoptimized />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove photo" className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-full bg-background/90 text-foreground shadow">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {value.length < max && (
        <button type="button" onClick={() => inputRef.current?.click()} className="grid size-20 place-items-center rounded-lg border-2 border-dashed text-muted-foreground hover:border-primary hover:text-foreground">
          <span className="flex flex-col items-center gap-1 text-[11px]">
            <Camera className="size-5" aria-hidden />
            {label}
          </span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple={max > 1} onChange={pick} className="hidden" />
    </div>
  );
}
