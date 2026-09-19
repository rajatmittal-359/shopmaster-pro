import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Shared pieces of the share cards (src/app/opengraph-image.js and
 * src/app/sellers/[id]/opengraph-image.js): the brand gradient from DESIGN.md
 * (Jaipur pink → royal violet → royal blue) and the jharokha mark as a data
 * URL, because satori draws only what it is handed inline.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const GRADIENT = 'linear-gradient(135deg, #C4356F 0%, #5B2BB0 55%, #2E3A8C 100%)';

export const markDataUrl = async () => {
  const png = await readFile(join(process.cwd(), 'public/brand/mark-512.png'));
  return `data:image/png;base64,${png.toString('base64')}`;
};
