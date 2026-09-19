/**
 * generateLessonAudio.js - the Learn lessons, read aloud once (plan 2.27).
 *
 * WHAT IT DOES
 *   Reads web/src/config/lessons.js, sends each lesson's spoken text to
 *   Sarvam's bulbul (Hindi voice for the Hindi lessons, Indian-English voice
 *   for the English ones), uploads the MP3s to Cloudinary under
 *   shopmaster-lessons/, and writes web/src/config/lessonAudio.json - the
 *   manifest the Learn page reads. Commit the manifest; the audio lives on
 *   Cloudinary.
 *
 * WHY ONCE AND NOT AT RUNTIME
 *   TTS is ₹30 per 10k characters; twelve lessons are ~8k characters, about
 *   ₹25 of the ₹100 free credits - and then never again until the words
 *   change. A "Listen" button that called the API per press would spend
 *   the same credits every day for the same sentences.
 *
 * WHEN TO RE-RUN
 *   After editing a lesson. Only lessons whose text hash changed are
 *   re-generated (the manifest keeps the hash), so a one-word fix costs one
 *   call.
 *
 *   node generateLessonAudio.js            dry run: what would be generated, at what cost
 *   node generateLessonAudio.js --write    generate, upload, write the manifest
 *   node generateLessonAudio.js --write --force   regenerate everything
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const sarvam = require('./utils/ai/sarvam');

const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');
const LESSONS_FILE = path.join(__dirname, '..', 'web', 'src', 'config', 'lessons.js');
const MANIFEST = path.join(__dirname, '..', 'web', 'src', 'config', 'lessonAudio.json');
const FOLDER = 'shopmaster-lessons';
const RUPEES_PER_10K = 30;

const hashOf = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 10);

const uploadMp3 = async (buffer, publicId) => {
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
  const dataUrl = `data:audio/mpeg;base64,${buffer.toString('base64')}`;
  // Audio goes up as resource_type video - Cloudinary's bucket for anything with a timeline.
  const r = await cloudinary.uploader.upload(dataUrl, { folder: FOLDER, public_id: publicId, resource_type: 'video', overwrite: true, invalidate: true });
  return r.secure_url;
};

(async () => {
  const { LESSONS, speech } = await import(pathToFileURL(LESSONS_FILE).href);
  let manifest = { generatedAt: null, hi: [], en: [], hashes: {} };
  try {
    manifest = { ...manifest, ...JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) };
  } catch {
    /* first run */
  }
  manifest.hashes = manifest.hashes || {};

  const plan = [];
  for (const lang of ['hi', 'en']) {
    (LESSONS[lang] || []).forEach((lesson, i) => {
      const text = speech(lesson);
      const id = `${lang}-${i + 1}`;
      const hash = hashOf(text);
      const have = manifest[lang]?.[i] && manifest.hashes[id] === hash;
      plan.push({ lang, i, id, text, hash, chars: text.length, skip: have && !FORCE });
    });
  }
  const todo = plan.filter((p) => !p.skip);
  const chars = todo.reduce((s, p) => s + p.chars, 0);
  console.log(`${plan.length} lessons, ${todo.length} to generate, ${chars} characters ≈ ₹${((chars / 10000) * RUPEES_PER_10K).toFixed(2)}`);
  for (const p of plan) console.log(`  ${p.skip ? 'keep    ' : 'generate'} ${p.id}  ${p.chars} chars${p.chars > 2500 ? '  ! over 2500 - split the lesson' : ''}`);
  if (!WRITE) {
    console.log('\nDry run. Add --write to generate and upload.');
    return;
  }
  if (!sarvam.enabled()) throw new Error('SARVAM_API_KEY is not set');

  for (const p of todo) {
    if (p.chars > 2500) throw new Error(`${p.id} is ${p.chars} characters - over one call; shorten the lesson`);
    const r = await sarvam.tts(p.text, { lang: p.lang, codec: 'mp3' });
    if (!r.ok) throw new Error(`${p.id}: ${r.reason}`);
    const url = await uploadMp3(r.audio, p.id);
    manifest[p.lang] = manifest[p.lang] || [];
    manifest[p.lang][p.i] = url;
    manifest.hashes[p.id] = p.hash;
    console.log(`  ✓ ${p.id}  ${Math.round(r.audio.length / 1024)} KB  ${url}`);
  }
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nManifest written: ${path.relative(process.cwd(), MANIFEST)}. Commit it.`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
