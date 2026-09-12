'use client';

import { useState } from 'react';
import Image from 'next/image';

/**
 * The photographs, which are what actually sells jewellery - and the one
 * short video, when the seller made one.
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
 *
 * WHERE THE VIDEO SITS (12 Sep 2026)
 *   Amazon and Flipkart both put the clip IN the thumbnail strip with a play
 *   badge, never as a separate section, and neither autoplays it - a clip
 *   that starts on its own spends a customer's mobile data without asking.
 *   Here it is the second tile: visible without scrolling the strip, but the
 *   first photograph stays the LCP element and the thing Google indexes.
 *   `preload="none"` so nothing downloads until the play button is pressed.
 */
export default function Gallery({ images = [], video = null, name }) {
  const [active, setActive] = useState(0);

  const tiles = images.map((src) => ({ kind: 'image', src }));
  if (video?.url) tiles.splice(Math.min(1, tiles.length), 0, { kind: 'video', ...video });

  if (!tiles.length) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
        No photograph yet
      </div>
    );
  }

  const current = tiles[active] || tiles[0];
  const photoNumber = (i) => tiles.slice(0, i + 1).filter((t) => t.kind === 'image').length;

  return (
    <div>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
        {current.kind === 'video' ? (
          <video
            key={current.url}
            src={current.url}
            poster={current.poster || undefined}
            controls
            playsInline
            preload="none"
            className="h-full w-full object-contain bg-black"
            aria-label={`${name} - video`}
          />
        ) : (
          <Image
            src={current.src}
            alt={`${name} - photograph ${photoNumber(active)} of ${images.length}`}
            fill
            priority={active === 0}
            /*
             * Without `sizes` the browser assumes the image is the full viewport
             * width and downloads one that big - an LCP problem on exactly the
             * 4G connections most of this shop's visitors are on.
             */
            sizes="(max-width: 768px) 100vw, 45vw"
            className="object-cover"
          />
        )}
      </div>

      {tiles.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {tiles.map((tile, i) => (
            <button
              key={tile.kind === 'video' ? `video-${tile.url}` : tile.src}
              type="button"
              onClick={() => setActive(i)}
              aria-label={tile.kind === 'video' ? 'Play the product video' : `Show photograph ${photoNumber(i)}`}
              aria-current={i === active}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === active ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              {tile.kind === 'video' ? (
                <>
                  {tile.poster ? (
                    <Image src={tile.poster} alt="" fill sizes="64px" className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 bg-muted" />
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-black/30">
                    <span className="grid size-7 place-items-center rounded-full bg-white/90 text-foreground">
                      <svg viewBox="0 0 20 20" className="ml-0.5 h-3.5 w-3.5" aria-hidden="true">
                        <path d="M6 4l10 6-10 6z" fill="currentColor" />
                      </svg>
                    </span>
                  </span>
                </>
              ) : (
                <Image src={tile.src} alt="" fill sizes="64px" className="object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
