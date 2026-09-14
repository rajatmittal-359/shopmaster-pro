/**
 * backupDb.js - the backup the free cluster does not give us.
 *
 * Atlas M0 has NO automated backups (that starts at M10). Until the cluster is
 * upgraded at cutover this script is the only copy of orders, payouts, sellers
 * and reviews outside Atlas. Run it once a week and before anything that
 * writes to many documents (seed --reset, a backfill, a migration).
 *
 *   node backupDb.js                       -> ../private/backups/2026-09-12T10-05/<collection>.json
 *   node backupDb.js --out ./backup        -> ./backup/<collection>.json (the GitHub Action, plan 2.37b)
 *   node backupDb.js --all                 -> also the rebuildable collections (see DERIVED)
 *   node backupDb.js --restore <dir> --into shopmaster_restore_test
 *
 * WEEKLY, FROM GITHUB (15 Sep 2026)
 *   .github/workflows/backup.yml runs this every Sunday and keeps the result
 *   as an encrypted 90-day artifact - the repository is public, and an
 *   artifact on a public repository can be downloaded by anyone with a
 *   GitHub account, so it is never uploaded in the clear.
 *
 * Export is Extended JSON (ObjectIds, Dates and Decimals survive). Restore
 * writes into a DIFFERENT database name by default and refuses the live one
 * without --force; you never want a backup script that overwrites the shop by
 * accident. `private/` is gitignored - the backups never reach GitHub.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient, BSON } = require('mongodb');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] || true;
};

const ROOT = path.join(__dirname, '..', 'private', 'backups');

/*
 * Rebuilt by a job, not typed by a person - not worth 12 of the 14 MB:
 * knowledgechunks (the RAG index, re-embedded every Sunday), aicaches (24-hour
 * TTL), aiproviderstates (quota memory). --all includes them.
 */
const DERIVED = new Set(['knowledgechunks', 'aicaches', 'aiproviderstates']);

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing - run from backend/ with .env present');
  const client = new MongoClient(uri);
  await client.connect();
  const live = client.db();

  const restoreDir = flag('--restore');
  if (restoreDir) {
    const into = flag('--into');
    if (!into || into === true) throw new Error('--into <dbName> is required for a restore');
    if (into === live.databaseName && !flag('--force')) {
      throw new Error(`refusing to restore over the live database "${into}" - pass --force if you truly mean it`);
    }
    const target = client.db(into);
    for (const file of fs.readdirSync(restoreDir).filter((f) => f.endsWith('.json'))) {
      const name = file.replace(/\.json$/, '');
      const docs = BSON.EJSON.parse(fs.readFileSync(path.join(restoreDir, file), 'utf8'));
      await target.collection(name).deleteMany({});
      if (docs.length) await target.collection(name).insertMany(docs);
      console.log(`${name.padEnd(18)} ${docs.length} restored into ${into}`);
    }
    await client.close();
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
  const out = flag('--out');
  const dir = out && out !== true ? path.resolve(out) : path.join(ROOT, stamp);
  fs.mkdirSync(dir, { recursive: true });
  const all = (await live.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  const names = flag('--all') ? all : all.filter((n) => !DERIVED.has(n));
  let total = 0;
  for (const name of names.sort()) {
    const docs = await live.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), BSON.EJSON.stringify(docs, { relaxed: false }));
    total += docs.length;
    console.log(`${name.padEnd(18)} ${docs.length}`);
  }
  console.log(`\n${total} documents from ${live.databaseName} -> ${dir}`);
  await client.close();
  // An empty export is a wrong URI or a wrong database, never a backup.
  if (total === 0) throw new Error('0 documents exported - check MONGO_URI (database name included)');
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
