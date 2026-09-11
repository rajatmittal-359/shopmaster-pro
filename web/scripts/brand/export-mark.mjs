#!/usr/bin/env node
/**
 * Turn a chosen logo draft into the files the site actually uses.
 *
 * USAGE
 *   node scripts/brand/export-mark.mjs brand-drafts/jharokha-2.png
 *
 * WHAT IT DOES
 *   1. Finds the tile inside the render. The model draws the rounded square on
 *      a near-black ground; the tile is everything that is not that ground.
 *   2. Crops to it and cuts the corners transparent with a rounded-rectangle
 *      mask at 22.37% of the side - the iOS squircle proportion, so it sits
 *      beside real app icons without looking like a sticker.
 *   3. Writes every size anything needs:
 *        public/brand/mark-512.png   header, footer, og images, anything large
 *        public/brand/mark-192.png   Android home screen (manifest)
 *        public/brand/mark-64.png    header at 2x
 *        src/app/icon.png            the favicon Next serves (32px)
 *        src/app/apple-icon.png      iOS home screen (180px)
 *
 * WHY sharp
 *   It is already in node_modules - Next.js ships it for image optimisation -
 *   so this costs no install, which on this laptop is not a small thing.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/brand/export-mark.mjs <draft.png>');
  process.exit(1);
}

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const dark = (x, y) => {
  const i = (y * W + x) * C;
  return data[i] + data[i + 1] + data[i + 2] < 90;
};

// Walk in from each edge along the middle until the ground ends.
let top = 0;
while (top < H && dark(W >> 1, top)) top += 1;
let bottom = H - 1;
while (bottom > 0 && dark(W >> 1, bottom)) bottom -= 1;
let left = 0;
while (left < W && dark(left, H >> 1)) left += 1;
let right = W - 1;
while (right > 0 && dark(right, H >> 1)) right -= 1;

// Square it up on the smaller side, centred, so the mask is a true squircle.
const side = Math.min(right - left + 1, bottom - top + 1);
const cx = Math.round((left + right) / 2);
const cy = Math.round((top + bottom) / 2);
const crop = {
  left: Math.max(0, cx - (side >> 1)),
  top: Math.max(0, cy - (side >> 1)),
  width: side,
  height: side,
};
console.log(`tile ${side}px at (${crop.left}, ${crop.top})`);

const radius = Math.round(side * 0.2237);
const mask = Buffer.from(
  `<svg width="${side}" height="${side}"><rect width="${side}" height="${side}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`
);

const master = await sharp(src)
  .extract(crop)
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

const outDir = resolve('public/brand');
mkdirSync(outDir, { recursive: true });

const targets = [
  ['public/brand/mark-512.png', 512],
  ['public/brand/mark-192.png', 192],
  ['public/brand/mark-64.png', 64],
  ['src/app/apple-icon.png', 180],
  ['src/app/icon.png', 32],
];

for (const [file, size] of targets) {
  await sharp(master).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(file);
  console.log(`✓ ${file} (${size}px)`);
}
