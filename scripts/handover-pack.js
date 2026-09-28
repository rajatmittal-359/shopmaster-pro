#!/usr/bin/env node
/**
 * Collect everything a new machine needs and `git clone` does not bring.
 *
 * Written 26 September 2026, the day Rajat moved to a Mac. The repository
 * carries the code and the reasoning; the secrets, the operator's own
 * checklist and everything Claude has learned live outside it on purpose.
 * Remembering all of that by hand at eleven at night is how a project loses
 * its Shiprocket password and three weeks of decisions.
 *
 * Writes ./handover (gitignored). Read HANDOVER.md for what to do with it.
 *
 *   node scripts/handover-pack.js              the useful half, about 6 MB
 *   node scripts/handover-pack.js --history    plus the session transcripts (~700 MB)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'handover');
const CLAUDE = path.join(os.homedir(), '.claude');
const withHistory = process.argv.includes('--history');

/** The project folder as Claude names it: the path, slashes turned to dashes. */
const projectSlug = ROOT.replace(/[\\/:]/g, '-').replace(/^-+/, (m) => m.replace(/-/g, ''));
const findProjectDir = () => {
  const dir = path.join(CLAUDE, 'projects');
  if (!fs.existsSync(dir)) return null;
  const want = path.basename(ROOT).toLowerCase();
  // The exact slug differs by platform, so match on the folder name instead.
  const hit = fs.readdirSync(dir).find((d) => d.toLowerCase().endsWith(want));
  return hit ? path.join(dir, hit) : null;
};

const copied = [];
const missing = [];

const copy = (from, to, label) => {
  if (!fs.existsSync(from)) {
    missing.push(label || from);
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  const stat = fs.statSync(from);
  const size = stat.isDirectory()
    ? fs.readdirSync(from, { recursive: true }).reduce((n, f) => {
        const p = path.join(from, String(f));
        return n + (fs.existsSync(p) && fs.statSync(p).isFile() ? fs.statSync(p).size : 0);
      }, 0)
    : stat.size;
  copied.push({ label: label || path.basename(from), size });
};

fs.rmSync(OUT, { recursive: true, force: true });

// ---------------------------------------------------------------- the project
copy(path.join(ROOT, 'private'), path.join(OUT, 'project', 'private'), 'private/ (keys, credentials, audit)');
copy(path.join(ROOT, 'OPS-AND-MANUAL-ACTIONS.md'), path.join(OUT, 'project', 'OPS-AND-MANUAL-ACTIONS.md'), "OPS-AND-MANUAL-ACTIONS.md (Rajat's checklist)");
copy(path.join(ROOT, 'ENV'), path.join(OUT, 'project', 'ENV'), 'ENV (local | prod switch)');
copy(path.join(ROOT, 'backend', '.env'), path.join(OUT, 'project', 'backend.env'), 'backend/.env');
copy(path.join(ROOT, 'web', '.env.local'), path.join(OUT, 'project', 'web.env.local'), 'web/.env.local');

/*
 * The two other env files (added 29 Sep 2026, the night before the move).
 *
 * `.env.real` and `.env.seed` were missed on the first pass because the list
 * above was written from memory of which files get edited, not from what is
 * actually gitignored. Both hold a live MONGO_URI, JWT_SECRET and the
 * Cloudinary secret - they point at different databases, which is the whole
 * reason they exist separately. Optional() rather than copy(): a machine that
 * never had them should not be told something is missing.
 */
const optional = (from, to, label) => {
  if (fs.existsSync(from)) copy(from, to, label);
};
optional(path.join(ROOT, 'backend', '.env.real'), path.join(OUT, 'project', 'backend.env.real'), 'backend/.env.real');
optional(path.join(ROOT, 'backend', '.env.seed'), path.join(OUT, 'project', 'backend.env.seed'), 'backend/.env.seed');

/*
 * The PROJECT's own Claude settings - `.claude/settings.json` and
 * `.claude/settings.local.json`, both gitignored. Small, and they carry the
 * permission and hook choices made over weeks. `.claude/project-rules/` is
 * NOT here on purpose: that one IS tracked, so `git clone` brings it.
 */
optional(path.join(ROOT, '.claude', 'settings.json'), path.join(OUT, 'project', 'claude-settings.json'), 'project .claude/settings.json');
optional(path.join(ROOT, '.claude', 'settings.local.json'), path.join(OUT, 'project', 'claude-settings.local.json'), 'project .claude/settings.local.json');

// ------------------------------------------------------------ Claude's memory
const projectDir = findProjectDir();
if (projectDir) {
  copy(path.join(projectDir, 'memory'), path.join(OUT, 'claude', 'memory'), 'what Claude has learned (memory/)');
  if (withHistory) {
    for (const f of fs.readdirSync(projectDir).filter((f) => f.endsWith('.jsonl'))) {
      copy(path.join(projectDir, f), path.join(OUT, 'claude', 'history', f), `transcript ${f.slice(0, 8)}…`);
    }
  }
} else {
  missing.push("Claude's project folder under ~/.claude/projects");
}

/*
 * The three project skills are user-level, so the repo does not carry them.
 *
 * `synced/` is deliberately NOT packed (checked 29 Sep 2026): it is the
 * account's own synced skills - the Backrr blog and LinkedIn ones - and they
 * come back by themselves the moment the Mac signs in as tech@backrr.com.
 * Carrying them would put another account's work in a pack full of this
 * project's keys. Anything else that appears beside the three IS packed, and
 * named, so a skill added later cannot be lost in silence.
 */
const PROJECT_SKILLS = ['frontend', 'backend', 'database'];
const NOT_OURS = ['synced'];
for (const skill of PROJECT_SKILLS) {
  copy(path.join(CLAUDE, 'skills', skill), path.join(OUT, 'claude', 'skills', skill), `skill /${skill}`);
}
try {
  const extra = fs
    .readdirSync(path.join(CLAUDE, 'skills'), { withFileTypes: true })
    // `.git` first of all: the skills folder is itself a repository, and
    // without this it packs 44 KB of git objects and calls it a skill.
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !PROJECT_SKILLS.includes(d.name) && !NOT_OURS.includes(d.name))
    .map((d) => d.name);
  for (const skill of extra) {
    copy(path.join(CLAUDE, 'skills', skill), path.join(OUT, 'claude', 'skills', skill), `skill /${skill} (found beside the three)`);
  }
} catch {
  /* no user-level skills folder at all */
}
copy(path.join(CLAUDE, 'settings.json'), path.join(OUT, 'claude', 'settings.json'), 'Claude settings.json');

/*
 * MCP servers live in ~/.claude.json, which is mostly machine state - and
 * carries keys. Only the servers are taken, so the new machine gets what it
 * needs and none of the old machine's history.
 */
try {
  const all = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude.json'), 'utf8'));
  if (all.mcpServers && Object.keys(all.mcpServers).length) {
    fs.mkdirSync(path.join(OUT, 'claude'), { recursive: true });
    fs.writeFileSync(path.join(OUT, 'claude', 'mcp-servers.json'), JSON.stringify(all.mcpServers, null, 2));
    copied.push({ label: `MCP servers (${Object.keys(all.mcpServers).join(', ')})`, size: 0 });
  }
} catch {
  missing.push('~/.claude.json (MCP servers)');
}

// The plugin list, as plain text: installing them again is one command each.
try {
  const s = JSON.parse(fs.readFileSync(path.join(CLAUDE, 'settings.json'), 'utf8'));
  const lines = Object.entries(s.enabledPlugins || {}).map(([k, on]) => `${on ? 'ON ' : 'off'}  ${k}`);
  const markets = Object.entries(s.extraKnownMarketplaces || {}).map(([k, v]) => `${k}  ${v?.source?.url || ''}`);
  fs.writeFileSync(
    path.join(OUT, 'claude', 'plugins.txt'),
    ['PLUGINS', ...lines, '', 'MARKETPLACES (add these first)', ...markets, ''].join('\n'),
  );
  copied.push({ label: 'plugins.txt (what to reinstall)', size: 0 });
} catch {
  missing.push('the plugin list');
}

// ------------------------------------------------------------------- the note
const mb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const manifest = [
  '# Handover pack',
  '',
  `Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} from ${ROOT}`,
  '',
  'This folder is everything `git clone` does NOT bring, and it is full of',
  'live keys. Carry it on a USB drive, or with LocalSend over your own wifi.',
  'Not WhatsApp, not mail, not Drive - those keep a copy in a chat history and',
  'a cloud backup you cannot fully wipe. Delete this folder from both machines',
  'once the new one is proved.',
  '',
  'The steps are in HANDOVER.md in the repository.',
  '',
  '## In this pack',
  '',
  ...copied.map((c) => `- ${c.label}${c.size ? ` · ${mb(c.size)}` : ''}`),
  ...(missing.length ? ['', '## Not found on this machine (check whether it matters)', '', ...missing.map((m) => `- ${m}`)] : []),
  '',
];
fs.writeFileSync(path.join(OUT, 'MANIFEST.md'), manifest.join('\n'));

console.log(manifest.join('\n'));
console.log(`\nWritten to ${OUT}`);
if (!withHistory) console.log('Session transcripts were left out; add --history for those (~700 MB).');
