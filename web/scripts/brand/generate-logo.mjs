#!/usr/bin/env node
/**
 * Generate logo concepts with an image model.
 *
 * TWO PROVIDERS, ONE SCRIPT
 *   Pollinations (default) - free with a registered key, no card. Sign in at
 *   https://enter.pollinations.ai with GitHub or Google, create a
 *   server-to-server key. Flux models cost nothing at all; the daily Pollen
 *   grant covers gpt-image-2, which is the best free image model available
 *   anywhere right now and the one to use for a mark.
 *
 *   Gemini - needs billing linked to the Google Cloud project, because image
 *   generation has NO free-tier allotment (the quota reads `none`, an absence
 *   rather than a rate limit). Kept for the day that changes.
 *
 * USAGE
 *   POLLINATIONS_API_KEY=... node scripts/brand/generate-logo.mjs             # all concepts, gpt-image-2
 *   POLLINATIONS_API_KEY=... MODEL=black-forest-labs/flux.2-klein-4b node scripts/brand/generate-logo.mjs
 *   POLLINATIONS_API_KEY=... node scripts/brand/generate-logo.mjs jharokha    # one concept
 *   PROVIDER=gemini GEMINI_API_KEY=... node scripts/brand/generate-logo.mjs
 *
 *   Output lands in web/brand-drafts/<concept>-<n>.png, which is gitignored:
 *   drafts are for choosing from, not for shipping. The chosen one is exported
 *   properly (SVG traced or PNG at 1024) into public/brand/.
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

const PROVIDER = process.env.PROVIDER || (process.env.GEMINI_API_KEY && !process.env.POLLINATIONS_API_KEY ? 'gemini' : 'pollinations');
const KEY = PROVIDER === 'gemini' ? process.env.GEMINI_API_KEY : process.env.POLLINATIONS_API_KEY;
const MODEL =
  process.env.MODEL || (PROVIDER === 'gemini' ? 'gemini-3.1-flash-image' : 'openai/gpt-image-2');
const OUT = resolve(process.cwd(), 'brand-drafts');
const VARIANTS = Number(process.env.VARIANTS || 2);

if (!KEY) {
  console.error(
    PROVIDER === 'gemini'
      ? 'Set GEMINI_API_KEY. Never paste the key into this file.'
      : 'Set POLLINATIONS_API_KEY - free at https://enter.pollinations.ai/keys. Never paste it into this file.'
  );
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

async function generateGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
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
          'generation has no free tier on Gemini. Use PROVIDER=pollinations instead.'
      );
    }
    throw new Error(`${res.status}: ${msg}`);
  }
  const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData);
  if (!part) throw new Error(`No image returned: ${JSON.stringify(data).slice(0, 200)}`);
  return Buffer.from(part.inlineData.data, 'base64');
}

/*
 * Pollinations' gateway takes the prompt in the PATH and the key as a bearer.
 * `seed` varies per variant so two runs of one concept are two ideas, not the
 * same image twice. `nologo` and `private` both need the key - which is fine,
 * the key is required for gpt-image-2 anyway.
 */
async function generatePollinations(prompt, seed) {
  const url = new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`);
  url.searchParams.set('model', MODEL);
  url.searchParams.set('width', '1024');
  url.searchParams.set('height', '1024');
  url.searchParams.set('seed', String(seed));
  url.searchParams.set('nologo', 'true');
  url.searchParams.set('private', 'true');

  const res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function generate(name, prompt, n) {
  const seed = 1000 + n * 7919;
  const bytes =
    PROVIDER === 'gemini' ? await generateGemini(prompt) : await generatePollinations(prompt, seed);
  const file = resolve(OUT, `${name}-${n}.png`);
  writeFileSync(file, bytes);
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
      if (/billing|Quota exhausted|401/.test(err.message)) process.exit(2);
    }
  }
}
