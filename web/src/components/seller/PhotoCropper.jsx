'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Cropping a product photo to a square, with the product filling the frame.
 *
 * WHY SQUARE
 *   Every card, every gallery tile and Google's product feed show a square.
 *   A phone photograph is 3:4 or 9:16, so without a crop the product sits
 *   small in the middle of a tall image with the seller's table around it.
 *   Amazon's own rule is that the product should fill at least 85% of the
 *   frame, and square images work best with zoom - so the frame here is
 *   square and the guide inside it is the 85% line.
 *
 * HOW IT WORKS
 *   One canvas. The image is drawn at a zoom the seller controls, at an
 *   offset they drag. Export draws the same view at 1600px and hands back a
 *   JPEG data URL, which then takes the place of the original in the form.
 *   No library: this is drawImage with four numbers.
 *
 * WHY THE ORIGINAL IS FETCHED THROUGH CLOUDINARY WHEN IT IS A URL
 *   A canvas can only export an image it was allowed to read, which means the
 *   image must come with CORS headers. Cloudinary sends them; the img element
 *   asks for them with crossOrigin="anonymous". A photo still in the browser
 *   is a data URL and needs neither.
 */
const OUT = 1600;

export default function PhotoCropper({ src, open, onCancel, onDone }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 = the image's shorter side fills the frame
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // in canvas px, from centred
  const drag = useRef(null);

  const SIZE = 360;

  /*
   * Zoom and offset start fresh because the PARENT remounts this component
   * per photo (it is keyed on the index) - resetting them here, inside the
   * effect, would be a state write on mount that React's lint rightly flags.
   */
  useEffect(() => {
    if (!open || !src) return undefined;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setReady(true);
    };
    img.src = src;
    return () => {
      imgRef.current = null;
    };
  }, [open, src]);

  /** Draw the current view onto any square canvas of side `s`. */
  const paint = (ctx, s) => {
    const img = imgRef.current;
    if (!img) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, s, s);
    const base = s / Math.min(img.naturalWidth, img.naturalHeight); // shorter side fills
    const scale = base * zoom;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const k = s / SIZE; // offsets were measured on the on-screen canvas
    const x = (s - w) / 2 + offset.x * k;
    const y = (s - h) / 2 + offset.y * k;
    ctx.drawImage(img, x, y, w, h);
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !ready) return;
    paint(c.getContext('2d'), SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoom, offset]);

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const finish = () => {
    const out = document.createElement('canvas');
    out.width = OUT;
    out.height = OUT;
    paint(out.getContext('2d'), OUT);
    try {
      onDone(out.toDataURL('image/jpeg', 0.9));
    } catch {
      // A tainted canvas: the image came from somewhere without CORS headers.
      onCancel(new Error('This photo cannot be cropped here. Download it, re-upload it, then crop.'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crop to a square</DialogTitle>
          <DialogDescription>
            Drag to position, slide to zoom. Keep the product inside the inner square - that is the
            85% Amazon asks for, and it is what fills a card.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto">
          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="touch-none cursor-grab rounded-lg border active:cursor-grabbing"
            />
            {/* The 85% guide. Decorative - pointer-events off so dragging works through it. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-sm border border-dashed border-primary/70"
              style={{ inset: `${SIZE * 0.075}px` }}
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                Loading photo…
              </div>
            )}
          </div>

          <label className="mt-3 flex items-center gap-3 text-sm">
            <span className="w-12 text-muted-foreground">Zoom</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onCancel()}>
            Cancel
          </Button>
          <Button type="button" onClick={finish} disabled={!ready}>
            Use this crop
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
