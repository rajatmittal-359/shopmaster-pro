/**
 * indexKnowledge.js - teaches "Ask ShopMaster" the platform.
 *
 * Not training. Retrieval: every document and every explanatory comment in
 * the code is cut into chunks, embedded (Gemini, free), and stored with a
 * vector in Atlas; at question time the assistant pulls the ten most
 * relevant chunks into its context. Change a doc or a comment, run this
 * again - only chunks whose text changed are re-embedded (hash), so a rerun
 * after a small edit costs a handful of calls.
 *
 * WHAT GOES IN, FOR WHOM
 *   everyone  policy pages, the customer Help copy, CLAUDE.md's rules,
 *             config/knowledge.js, the taxonomy
 *   seller    seller panel copy (Help, Learn, Grow), seller rules,
 *             the "why" comments of seller-facing code
 *   admin     FRONTEND-PLAN, WHAT-IS-LEFT, project rules, ops-facing comments
 *   never     .env, private/, credentials, keys, test data
 *
 *   node indexKnowledge.js            index everything
 *   node indexKnowledge.js --dry      count chunks, embed nothing
 *   node indexKnowledge.js --ensure   create the Atlas vector index only
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const KnowledgeChunk = require('./models/KnowledgeChunk');
const { embed, DIMS } = require('./utils/ai/embed');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const ENSURE = process.argv.includes('--ensure');
const INDEX = 'knowledge_vec';

/** [relative path, audience, how to read] */
const SOURCES = [
  ['CLAUDE.md', 'admin', 'md'],
  ['WHAT-IS-LEFT.md', 'admin', 'md'],
  ['FRONTEND-PLAN.md', 'admin', 'md'],
  ['.claude/project-rules/frontend.md', 'admin', 'md'],
  ['.claude/project-rules/backend.md', 'admin', 'md'],
  ['.claude/project-rules/database.md', 'admin', 'md'],
  ['web/DESIGN.md', 'admin', 'md'],
  ['backend/config/knowledge.js', 'everyone', 'js'],
  ['backend/config/sellerRules.js', 'everyone', 'js'],
  ['backend/config/taxonomy.js', 'everyone', 'taxonomy'],
  ['web/src/app/(policy)/refund-policy/page.js', 'everyone', 'jsx-text'],
  ['web/src/app/(policy)/shipping-policy/page.js', 'everyone', 'jsx-text'],
  ['web/src/app/(policy)/selling-policy/page.js', 'everyone', 'jsx-text'],
  ['web/src/app/(policy)/terms/page.js', 'everyone', 'jsx-text'],
  ['web/src/app/(policy)/privacy/page.js', 'everyone', 'jsx-text'],
  ['web/src/app/(policy)/how-we-rank/page.js', 'everyone', 'jsx-text'],
  ['web/src/app/(policy)/compliance/page.js', 'everyone', 'jsx-text'],
  ['web/src/app/help/page.js', 'everyone', 'jsx-text'],
  ['web/src/components/seller/Help.jsx', 'seller', 'jsx-text'],
  ['web/src/components/seller/Learn.jsx', 'seller', 'jsx-text'],
  ['web/src/components/seller/Grow.jsx', 'seller', 'jsx-text'],
  ['web/src/components/seller/Performance.jsx', 'seller', 'jsx-text'],
];
/** Code whose comments explain the business: comments only, never secrets. */
const CODE_DIRS = [
  ['backend/utils', 'seller'],
  ['backend/controllers', 'admin'],
  ['backend/models', 'admin'],
  ['backend/jobs', 'admin'],
  ['web/src/components/seller', 'seller'],
  ['web/src/components/orders', 'everyone'],
  ['web/src/components/checkout', 'everyone'],
  ['web/src/components/admin', 'admin'],
];
const SKIP = /node_modules|\.test\.|tests\/|private\/|\.env|credential|secret|serviceAuth|tokenUtils|password/i;

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');

/** Markdown: split on headings, keep the heading as the title. */
const chunkMarkdown = (text, file) => {
  const out = [];
  const parts = text.split(/\n(?=#{1,4} )/);
  for (const part of parts) {
    const m = part.match(/^(#{1,4}) (.+)/);
    const title = m ? m[2].trim() : path.basename(file);
    const body = part.replace(/^#{1,4} .+\n?/, '').trim();
    if (body.length < 80) continue;
    for (const piece of splitLong(body, 1800)) out.push({ title, text: `${title}\n\n${piece}` });
  }
  return out;
};

const splitLong = (text, max) => {
  if (text.length <= max) return [text];
  const out = [];
  let buf = '';
  const paras = text.split(/\n\s*\n/).flatMap((p) => (p.length > max ? splitLines(p, max) : [p]));
  for (const para of paras) {
    if ((buf + '\n\n' + para).length > max && buf) {
      out.push(buf.trim());
      buf = para;
    } else buf = buf ? `${buf}\n\n${para}` : para;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
};

const splitLines = (text, max) => {
  const out = [];
  let buf = '';
  for (const line of text.split('\n')) {
    if ((buf + '\n' + line).length > max && buf) {
      out.push(buf);
      buf = line;
    } else buf = buf ? `${buf}\n${line}` : line;
  }
  if (buf) out.push(buf);
  return out;
};

/** Source: the block comments and the runs of adjacent // lines, code left out. */
const commentsOf = (text) => {
  const blocks = [...text.matchAll(/\/\*\*?([\s\S]*?)\*\//g)].map((m) => m[1].replace(/^\s*\*\s?/gm, '').trim());
  const runs = [];
  let buf = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*\/\/\s?(.*)$/);
    if (m && m[1].trim()) buf.push(m[1].trim());
    else {
      if (buf.length >= 3) runs.push(buf.join(' '));
      buf = [];
    }
  }
  if (buf.length >= 3) runs.push(buf.join(' '));
  return [...blocks.filter((b) => b.length > 60), ...runs].join('\n\n');
};

/**
 * JSX pages: the visible prose. The return() block with tags stripped, JSX
 * expressions reduced to their inner strings, section titles kept as lines.
 */
const jsxText = (text) => {
  const at = text.indexOf('return (');
  const body = text.slice(at >= 0 ? at : 0);
  // copy kept in data arrays above the return (lessons, Q&A, checklists)
  const literals = [...text.slice(0, at >= 0 ? at : 0).matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.){25,}?)\1/g)]
    .map((m) => m[2].replace(/\\n/g, ' ').trim())
    .filter((s) => !/className|https?:|=>|import |\/seller\/|\bpx\b|\btext-/.test(s));
  return (literals.join('\n') + '\n' + body)
    .replace(/title="([^"]+)"/g, '>\n$1\n<')
    .replace(/\{['"`]([^'"`]*)['"`]\}/g, '$1')
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/<\/(p|li|h[1-6]|section|div|td|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && !/^[();,{}\]\[]+$/.test(l) && !/^(return|export|const|import|\}|\)|\/\/)/.test(l))
    .join('\n')
    .replace(/\n{2,}/g, '\n');
};

const taxonomyText = () => {
  const tree = require('./config/taxonomy');
  return tree.map((m) => `${m.name}: ${m.children.map(([n]) => n).join(', ')}`).join('\n');
};

const gather = () => {
  const chunks = [];
  const push = (source, audience, title, text, order) => chunks.push({ source, audience, title, text, order, hash: hash(`${source}|${text}`) });
  for (const [rel, audience, kind] of SOURCES) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    let pieces = [];
    if (kind === 'md') pieces = chunkMarkdown(raw, rel);
    else if (kind === 'js') pieces = splitLong(commentsOf(raw) + '\n\n' + raw.replace(/\/\*[\s\S]*?\*\//g, '').slice(0, 6000), 1800).map((t) => ({ title: path.basename(rel), text: t }));
    else if (kind === 'taxonomy') pieces = splitLong(`Categories on ShopMaster Pro (main: sub-categories)\n${taxonomyText()}`, 1800).map((t) => ({ title: 'Categories', text: t }));
    else if (kind === 'jsx-text') pieces = splitLong(jsxText(raw), 1800).filter((t) => t.length > 80).map((t) => ({ title: path.basename(rel, path.extname(rel)), text: t }));
    pieces.forEach((p, i) => push(`${rel}#${i + 1}`, audience, p.title, p.text, i));
  }
  for (const [dir, audience] of CODE_DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      const rel = `${dir}/${name}`;
      if (SKIP.test(rel) || !/\.(js|jsx|mjs)$/.test(name)) continue;
      const raw = fs.readFileSync(path.join(full, name), 'utf8');
      const c = commentsOf(raw);
      if (c.length < 200) continue;
      splitLong(c, 1800).forEach((t, i) => push(`${rel}#${i + 1}`, audience, `${name} - how it works`, `${name}\n\n${t}`, i));
    }
  }
  return chunks;
};

const ensureIndex = async () => {
  const col = mongoose.connection.db.collection('knowledgechunks');
  const existing = await col.listSearchIndexes().toArray().catch(() => []);
  const def = {
    fields: [
      { type: 'vector', path: 'vector', numDimensions: DIMS, similarity: 'cosine' },
      { type: 'filter', path: 'audience' },
    ],
  };
  if (existing.some((i) => i.name === INDEX)) {
    await col.updateSearchIndex(INDEX, def);
    console.log(`${INDEX} updated`);
  } else {
    await col.createSearchIndex({ name: INDEX, type: 'vectorSearch', definition: def });
    console.log(`${INDEX} created - READY in a minute`);
  }
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (ENSURE) {
    await ensureIndex();
    return mongoose.disconnect();
  }
  const chunks = gather();
  const byAud = chunks.reduce((m, c) => ({ ...m, [c.audience]: (m[c.audience] || 0) + 1 }), {});
  console.log(`${chunks.length} chunks from ${new Set(chunks.map((c) => c.source.split('#')[0])).size} files`, byAud);
  if (DRY) return mongoose.disconnect();

  const have = new Map((await KnowledgeChunk.find({}).select('hash source audience').lean()).map((c) => [c.hash, c]));
  const wanted = new Set(chunks.map((c) => c.hash));
  const stale = [...have.keys()].filter((h) => !wanted.has(h));
  if (stale.length) await KnowledgeChunk.deleteMany({ hash: { $in: stale } });

  let embedded = 0;
  let failed = 0;
  let retagged = 0;
  for (const c of chunks) {
    const old = have.get(c.hash);
    if (old) {
      // Same text, different wall: fix the tag, keep the vector.
      if (old.audience !== c.audience) {
        await KnowledgeChunk.updateOne({ hash: c.hash }, { $set: { audience: c.audience } });
        retagged += 1;
      }
      continue;
    }
    let r = await embed(c.text, { taskType: 'RETRIEVAL_DOCUMENT' });
    // The free tier meters per minute as well as per day: wait a minute,
    // twice, before deciding the day's allowance is gone.
    for (let wait = 0; !r.ok && /quota|429/i.test(r.reason) && wait < 2; wait += 1) {
      console.log(`  quota pause (${embedded} done) - waiting 65s`);
      await new Promise((ok) => setTimeout(ok, 65000));
      r = await embed(c.text, { taskType: 'RETRIEVAL_DOCUMENT' });
    }
    if (!r.ok) {
      failed += 1;
      console.warn(`  embed failed (${r.reason.slice(0, 60)}): ${c.source}`);
      if (/quota|429/i.test(r.reason)) {
        console.warn('  daily quota reached - run again tomorrow; already-embedded chunks are kept');
        break;
      }
      continue;
    }
    await KnowledgeChunk.create({ ...c, vector: r.vector });
    embedded += 1;
  }
  await ensureIndex();
  console.log(`\nembedded ${embedded} new, retagged ${retagged}, removed ${stale.length} stale, failed ${failed}. Total ${await KnowledgeChunk.countDocuments()} chunks.`);
  await mongoose.disconnect();
};

if (require.main === module) {
  run().catch(async (e) => {
    console.error(e.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { gather, chunkMarkdown, commentsOf, jsxText, INDEX };
