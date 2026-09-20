#!/usr/bin/env node
/**
 * One word decides the environment (21 Sep 2026).
 *
 *   ENV file at the repo root:   local   |   prod
 *   npm run server               the API, in that environment
 *   npm run web                  the storefront, in that environment
 *
 * Rajat: "VS Code pe aaun to bas ek shabd badal doon - prod ya local - fir
 * poora environment change ho jaye, fir terminal me npm run server / npm run
 * web karoon aur us environment ke hisaab se sab aa jaye."
 *
 * WHAT EACH WORD MEANS
 *   local  exactly today: backend/.env (dev database), web/.env.local
 *          (localhost API), in-process cron, mail on. Nothing changes.
 *   prod   the production values from private/api.env.prod, with the four
 *          things the 12-factor / "never point a dev server at prod" practice
 *          insists on:
 *            1. the database user is READ-ONLY (MONGO_URI_READ, the Atlas user
 *               smp_read) - any write fails loudly, nothing can be broken;
 *            2. in-process cron is off (USE_EXTERNAL_CRON) - no double mails;
 *            3. mail and push are disabled (their keys blanked) - nobody hears
 *               from the laptop;
 *            4. cookies are not Secure and FRONTEND_URL is localhost - login
 *               works over http://localhost.
 *          The web dev server is told to use the local API (which is on prod
 *          data), so the page you look at is the live shop, read-only.
 *          A red banner says so in the terminal.
 *
 * WHAT IT NEVER DOES
 *   Build anything. Production images are built in GitHub Actions; the laptop
 *   only ever runs dev servers. It never writes to production: the read-only
 *   user is the guarantee, not this script's good intentions.
 *
 * Data viewing: MongoDB Compass with two saved connections - dev (green) and
 * prod read-only (red) - see OPS "ENV switch".
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const target = process.argv[2];
if (!['server', 'web'].includes(target)) {
  console.error('usage: node scripts/run.js server|web   (reads the ENV file: local | prod)');
  process.exit(2);
}

const envFile = path.join(ROOT, 'ENV');
const mode = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').trim().toLowerCase() : 'local';
if (!['local', 'prod'].includes(mode)) {
  console.error(`ENV says "${mode}" - it must be exactly local or prod`);
  process.exit(2);
}

const parseEnv = (file) =>
  Object.fromEntries(
    fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .filter(Boolean)
      // The box's env_file doubles $ as $$; undo that here.
      .map((m) => [m[1], m[2].trim().replace(/^"(.*)"$/, '$1').replace(/\$\$/g, '$')]),
  );

const red = (s) => `\x1b[41m\x1b[97m ${s} \x1b[0m`;
const green = (s) => `\x1b[42m\x1b[30m ${s} \x1b[0m`;

let extraEnv = {};
if (mode === 'prod') {
  const prodFile = path.join(ROOT, 'private', 'api.env.prod');
  if (!fs.existsSync(prodFile)) {
    console.error(red('prod mode needs private/api.env.prod (the laptop copy of the box env)'));
    process.exit(2);
  }
  const prod = parseEnv(prodFile);
  if (!prod.MONGO_URI_READ) {
    console.error(red('prod mode refuses to start without a READ-ONLY database user.'));
    console.error(`
  Once, in Atlas (project shopmaster-prod):
    Database Access -> Add new database user -> Password
      username smp_read, autogenerate a password
      Built-in role: "Only read any database"  (or read @ shopmaster_prod)
    Network Access -> your laptop IP is already there.
  Then add ONE line to private/api.env.prod (never to git):
    MONGO_URI_READ=mongodb+srv://smp_read:<password>@prod.ovpigj2.mongodb.net/shopmaster_prod?retryWrites=false&w=majority&appName=prod
`);
    process.exit(2);
  }
  if (target === 'server') {
    extraEnv = {
      ...prod,
      MONGO_URI: prod.MONGO_URI_READ,
      NODE_ENV: 'development',
      COOKIE_SECURE: 'false',
      FRONTEND_URL: 'http://localhost:3000',
      SITE_URL: 'http://localhost:3000',
      USE_EXTERNAL_CRON: 'true',
      // Nobody hears from the laptop: mail, push and the courier webhook token off.
      BREVO_API_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_PUBLIC_KEY: '',
      SHIPROCKET_WEBHOOK_TOKEN: '',
      META_CAPI_TOKEN: '',
      ENV_MODE: 'prod-read',
    };
  } else {
    extraEnv = {
      NEXT_PUBLIC_API_URL: 'http://localhost:5000/api',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
      NEXT_PUBLIC_META_PIXEL_ID: '',
      ENV_MODE: 'prod-read',
    };
  }
}

const banner = mode === 'prod'
  ? red(`PROD (READ-ONLY) - ${target === 'server' ? 'API on the production database as smp_read; cron, mail, push OFF' : 'web on the local API (production data, read-only)'}`)
  : green(`LOCAL - ${target === 'server' ? 'API on the dev database (backend/.env)' : 'web on localhost API (web/.env.local)'}`);
console.log('\n' + banner + '\n');

const cwd = path.join(ROOT, target === 'server' ? 'backend' : 'web');
const script = target === 'server' ? 'server' : 'dev';
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
  cwd,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, ...extraEnv },
});
child.on('exit', (code) => process.exit(code ?? 0));
