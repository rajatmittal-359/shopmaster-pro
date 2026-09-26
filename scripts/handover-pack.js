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

// The three project skills are user-level, so the repo does not carry them.
for (const skill of ['frontend', 'backend', 'database']) {
  copy(path.join(CLAUDE, 'skills', skill), path.join(OUT, 'claude', 'skills', skill), `skill /${skill}`);
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
  'This folder is everything `git clone` does NOT bring. It is full of live',
  'keys: move it by cable or AirDrop, never by mail or cloud, and delete it',
  'from both machines once the new one is proved.',
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
