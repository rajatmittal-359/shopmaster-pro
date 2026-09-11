#!/usr/bin/env node
/**
 * Generate logo concepts with Gemini's image models.
 *
 * USAGE
 *   GEMINI_API_KEY=... node scripts/brand/generate-logo.mjs            # all concepts
 *   GEMINI_API_KEY=... node scripts/brand/generate-logo.mjs jharokha   # one concept
 *   GEMINI_API_KEY=... MODEL=gemini-3-pro-image node scripts/brand/generate-logo.mjs
 *
 *   Output lands in web/brand-drafts/<concept>-<n>.png, which is gitignored:
 *   drafts are for choosing from, not for shipping. The chosen one is exported
 *   properly (SVG traced or PNG at 1024) into public/brand/.
 *
 * WHAT YOU NEED BEFORE THIS WORKS
 *   Image generation has NO free-tier allotment on the Gemini API - the quota
 *   comes back as `quotaValue: none`, which is not a rate limit, it is an
 *   absence. The Google Cloud project behind the key needs a billing account
 *   linked (AI Studio -> Settings -> Plan, or Cloud Console -> Billing). At the
 *   time of writing the flash image model is a few rupees per image and the pro
 *   one roughly three times that.
 *
 * WHY THE PROMPT IS WRITTEN THE WAY IT IS
 *   - "no text": image models spell badly, and a wordmark is set in type anyway.
 *   - a plain dark background: so the draft can be judged as a MARK, not as an
 *     illustration, and so it can be cut out cleanly.
 *   - "legible at 32 pixels": the header is the only place most people will
 *     ever see it, and a beautiful 1024px render that turns to mud at 32 is a
 *     failed logo.
 *   - the palette by hex: the model otherwise drifts toward whatever purple it
 *     likes, and the mark has to sit inside the site's own tokens.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || 'gemini-3.1-flash-image';
const OUT = resolve(process.cwd(), 'brand-drafts');
const VARIANTS = Number(process.env.VARIANTS || 2);

if (!KEY) {
  console.error('Set GEMINI_API_KEY. Never paste the key into this file.');
  process.exit(1);
}

const STYLE =
  'Premium app-icon style logo mark, centered on a plain solid very dark background (#0B0A1A). ' +
  'No text, no letters, no watermark, no border, no mockup, no device frame. ' +
  'Soft-3D clay rendering with gentle top-left studio lighting, subtle glossy highlights, ' +
  'clean vector-like edges, strong silhouette, high contrast, must remain legible when scaled to 32 pixels. ' +
  'Palette: Jaipur pink-to-rose (#E0457B to #F9A8C8) as the warm accent, royal violet (#5B2BB0), ' +
  'royal blue (#1D2671). Modern, minimal, luxurious. An Indian marketplace brand from Jaipur. Square, 1:1.';

const CONCEPTS = {
  jharokha:
    'A single Rajasthani jharokha: a pointed cusped Mughal-Rajput arch window on a rounded-square ' +
    'pink-to-violet-to-royal-blue gradient tile, the arch opening glowing warm pink from inside, a slim ' +
    'projecting stone ledge beneath it, two thin vertical mullions. ',
  'arch-bag':
    'An abstract shop doorway: a multifoil scalloped Rajput arch whose opening holds a small glowing ' +
    'rounded shopping-bag silhouette in pink, on a rounded-square royal violet tile. ',
  'hawa-mahal-bag':
    'A shopping bag whose top edge is shaped like three tiny stacked jharokha arches of Hawa Mahal, ' +
    'rendered as one clean solid glossy 3D shape in violet-to-royal-blue gradient with pink inner glow, on a dark tile. ',
  gateway:
    'A grand Jaipur city gateway like Patrika Gate reduced to its simplest geometry: one central pointed ' +
    'arch flanked by two small ones, on a rounded-square gradient tile, the central arch lit pink. ',
  monogram:
    'A bold letter S built from a single ribbon that folds like a Rajasthani arch at the top, extruded ' +
    'in soft 3D, pink-to-violet gradient on a royal blue rounded-square tile. ',
};

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(CONCEPTS);

mkdirSync(OUT, { recursive: true });

async function generate(name, prompt, n) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + STYLE }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || res.statusText;
    if (res.status === 429 && /quota/i.test(msg)) {
      throw new Error(
        'Quota exhausted. If this is a fresh key, the project has no billing account - image ' +
          'generation has no free tier. Link billing in AI Studio and run again.'
      );
    }
    throw new Error(`${res.status}: ${msg}`);
  }

  const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) throw new Error(`No image returned for ${name}: ${JSON.stringify(data).slice(0, 200)}`);

  const file = resolve(OUT, `${name}-${n}.png`);
  writeFileSync(file, Buffer.from(part.inlineData.data, 'base64'));
  return file;
}

for (const name of names) {
  const prompt = CONCEPTS[name];
  if (!prompt) {
    console.error(`Unknown concept "${name}". Known: ${Object.keys(CONCEPTS).join(', ')}`);
    continue;
  }
  for (let n = 1; n <= VARIANTS; n += 1) {
    try {
      const file = await generate(name, prompt, n);
      console.log(`✓ ${name} ${n} -> ${file}`);
    } catch (err) {
      console.error(`✗ ${name} ${n}: ${err.message}`);
      if (/billing|Quota exhausted/.test(err.message)) process.exit(2);
    }
  }
}
