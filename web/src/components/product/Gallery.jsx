'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

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
 *
 * ZOOM (E2, 22 Sep 2026)
 *   Baymard: on a product page the photo is the product, and a zoom that
 *   does not exist or needs a hunt is the #1 image complaint. Two forms,
 *   both without a library: on a pointer device the main photo magnifies
 *   2x under the cursor as it moves (Zara, Myntra - in place, no second
 *   pane); a tap or click opens the photograph edge to edge in a lightbox
 *   with arrows, keys and the phone's own pinch. `object-cover` for the
 *   square tile, `object-contain` in the lightbox so nothing is cropped.
 */
export default function Gallery({ images = [], video = null, name, facts = '' }) {
  const [active, setActive] = useState(0);
  const [origin, setOrigin] = useState(null); // 'x% y%' while the pointer is over the photo
  const [lightbox, setLightbox] = useState(false);

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
  const photoTiles = tiles.map((t, i) => ({ ...t, i })).filter((t) => t.kind === 'image');
  const step = (d) => {
    const at = photoTiles.findIndex((t) => t.i === active);
    const next = photoTiles[(at + d + photoTiles.length) % photoTiles.length];
    if (next) setActive(next.i);
  };

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    setOrigin(`${x}% ${y}%`);
  };

  return (
    <div>
      <div
        data-gallery-main
        className={`relative aspect-square w-full overflow-hidden rounded-xl bg-muted ${current.kind === 'image' ? 'cursor-zoom-in' : ''}`}
        onPointerMove={current.kind === 'image' ? (e) => (e.pointerType === 'mouse' ? onMove(e) : null) : undefined}
        onPointerLeave={() => setOrigin(null)}
        onClick={current.kind === 'image' ? () => setLightbox(true) : undefined}
        role={current.kind === 'image' ? 'button' : undefined}
        tabIndex={current.kind === 'image' ? 0 : undefined}
        onKeyDown={current.kind === 'image' ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightbox(true); } } : undefined}
        aria-label={current.kind === 'image' ? 'Open the photograph full size' : undefined}
      >
        {current.kind === 'video' && current.youtubeId ? (
          <iframe
            key={current.youtubeId}
            src={`https://www.youtube-nocookie.com/embed/${current.youtubeId}?rel=0&modestbranding=1&playsinline=1`}
            title={`${name} - video`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="h-full w-full bg-black"
          />
        ) : current.kind === 'video' ? (
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
            alt={`${name}${facts ? ` - ${facts}` : ''} - photo ${photoNumber(active)} of ${images.length}`}
            fill
            priority={active === 0}
            /*
             * Without `sizes` the browser assumes the image is the full viewport
             * width and downloads one that big - an LCP problem on exactly the
             * 4G connections most of this shop's visitors are on.
             */
            sizes="(max-width: 768px) 100vw, 45vw"
            className="object-cover transition-transform duration-150 ease-out will-change-transform"
            style={origin ? { transform: 'scale(2)', transformOrigin: origin } : undefined}
          />
        )}
      </div>

      {lightbox && current.kind === 'image' && (
        <Lightbox
          src={current.src}
          alt={`${name} - photo ${photoNumber(active)} of ${images.length}`}
          count={photoTiles.length}
          index={photoTiles.findIndex((t) => t.i === active)}
          onStep={step}
          onClose={() => setLightbox(false)}
        />
      )}

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

/**
 * The photograph edge to edge. A plain fixed layer, not the form dialog: no
 * card, no padding, black behind - the photo is the whole point. Escape and
 * the arrow keys work; on a phone the browser's own pinch zoom does the rest.
 */
function Lightbox({ src, alt, count, index, onStep, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, onStep]);

  return (
    <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[70] flex items-center justify-center bg-black" onClick={onClose}>
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <X className="size-5" aria-hidden />
      </button>
      {count > 1 && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); onStep(-1); }} aria-label="Previous photograph" className="absolute left-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onStep(1); }} aria-label="Next photograph" className="absolute right-2 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <ChevronRight className="size-6" aria-hidden />
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">{index + 1} / {count}</p>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- full-resolution original, no resizing wanted here */}
      <img src={src} alt={alt} className="max-h-full max-w-full select-none object-contain" onClick={(e) => e.stopPropagation()} draggable={false} />
    </div>
  );
}
