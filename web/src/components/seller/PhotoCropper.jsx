'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RotateCw } from 'lucide-react';
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
  const [turn, setTurn] = useState(0); // degrees, 0 / 90 / 180 / 270
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

  /**
   * Draw the current view onto any square canvas of side `s`.
   *
   * Rotation (23 Sep 2026): a phone photograph often arrives on its side, and
   * Shopify's own media editor answers that with one Rotate button. Here the
   * canvas is turned about its centre before the photograph is drawn, so the
   * preview and the saved crop are the same thing - one tap, 90 degrees, four
   * taps back to where it was.
   */
  const paint = (ctx, s) => {
    const img = imgRef.current;
    if (!img) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, s, s);
    ctx.save();
    if (turn) {
      ctx.translate(s / 2, s / 2);
      ctx.rotate((turn * Math.PI) / 180);
      ctx.translate(-s / 2, -s / 2);
    }
    const base = s / Math.min(img.naturalWidth, img.naturalHeight); // shorter side fills
    const scale = base * zoom;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const k = s / SIZE; // offsets were measured on the on-screen canvas
    const x = (s - w) / 2 + offset.x * k;
    const y = (s - h) / 2 + offset.y * k;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !ready) return;
    paint(c.getContext('2d'), SIZE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoom, offset, turn]);

  const onPointerDown = (e) => {
    // The canvas may be drawn smaller than its 360 px resolution on a phone,
    // so a finger moving 10 screen pixels must move the photograph 10 * k
    // canvas pixels - otherwise dragging feels slow on a small screen.
    const rect = e.currentTarget.getBoundingClientRect();
    const k = SIZE / (rect.width || SIZE);
    drag.current = { x: e.clientX - offset.x / k, y: e.clientY - offset.y / k, k };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const { x, y, k } = drag.current;
    setOffset({ x: (e.clientX - x) * k, y: (e.clientY - y) * k });
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

        {/*
          Fluid on a phone (23 Sep 2026). The box was a fixed 360 px, which is
          wider than the dialog on a 360 px screen: everything to its right -
          including the Rotate button - was pushed off the edge, and Rajat's
          phone showed a cropper with no controls. The canvas keeps its 360 px
          drawing resolution (the crop maths is in those units); only the box
          it is painted into is now fluid, and the drag is scaled to match.
        */}
        <div className="mx-auto w-full" style={{ maxWidth: SIZE }}>
          <div className="relative aspect-square w-full">
            <canvas
              ref={canvasRef}
              width={SIZE}
              height={SIZE}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="h-full w-full touch-none cursor-grab rounded-lg border active:cursor-grabbing"
            />
            {/* The 85% guide. Decorative - pointer-events off so dragging works through it. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-sm border border-dashed border-primary/70"
              style={{ inset: '7.5%' }}
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                Loading photo…
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="w-12 text-muted-foreground">Zoom</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="min-w-32 flex-1 accent-primary"
              aria-label="Zoom"
            />
            {/* One button, 90 degrees a tap - the answer to a photo that came
                off the phone on its side (Shopify's media editor has the same). */}
            <Button type="button" variant="outline" size="sm" onClick={() => setTurn((d) => (d + 90) % 360)}>
              <RotateCw className="size-4" aria-hidden />
              Rotate
            </Button>
          </div>
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
