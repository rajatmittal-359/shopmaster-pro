'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * The photographs, which are what actually sells jewellery.
 *
 * WHY THUMBNAILS AND NOT DOTS
 *   Baymard: 56% of shoppers' first action on a product page is exploring the
 *   images, and thumbnails produce the LOWEST rate of unintentional taps of any
 *   indicator - yet 76% of mobile sites leave them out. They are also the only
 *   indicator that says what the other pictures contain before you open them.
 *
 * WHY THE FIRST IMAGE IS NOT LAZY
 *   It is the largest thing on the screen, so it is the LCP element. It is
 *   marked priority and kept OUT of any Suspense boundary - a boundary cannot
 *   paint until it resolves, which is Next's own documented warning.
 */
export default function Gallery({ images = [], name }) {
  const [active, setActive] = useState(0);

  if (!images.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
        No photograph yet
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
        <Image
          src={images[active]}
          alt={`${name} - photograph ${active + 1} of ${images.length}`}
          fill
          priority
          /*
           * Without `sizes` the browser assumes the image is the full viewport
           * width and downloads one that big - an LCP problem on exactly the
           * 4G connections most of this shop's visitors are on.
           */
          sizes="(max-width: 768px) 100vw, 45vw"
          className="object-cover"
        />
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photograph ${i + 1}`}
              aria-current={i === active}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === active ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              <Image src={src} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
