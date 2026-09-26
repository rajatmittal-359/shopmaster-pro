# Moving ShopMaster Pro to another machine

Written 26 September 2026, when Rajat moved from the Windows laptop to a Mac.
Everything here was checked on the machine it describes, not remembered.

`git clone` brings the code and the reasoning. It does **not** bring the
secrets, the operator's own checklist, or anything Claude has learned - those
live outside the repository on purpose, and they are the half that makes a new
session useful on day one instead of week three. `node scripts/handover-pack.js`
collects exactly that half into one folder.

---

## 1. What travels by itself (nothing to do)

`git clone https://github.com/rajatmittal-359/shopmaster-pro` brings:

| | |
|---|---|
| `backend/` `web/` `deploy/` `scripts/` | the whole product |
| `CLAUDE.md` | how Claude works on this project - the rules, with their reasons |
| `.claude/project-rules/{frontend,backend,database}.md` | what the three skills read first |
| `FRONTEND-PLAN.md` | why every page looks the way it does - 56 dated entries |
| `WHAT-IS-LEFT.md` | the one list of work decided and unfinished |
| `web/DESIGN.md` | tokens and the rules of the visual system |
| `README.md` `HANDOVER.md` | the front door, and this page |

Those five documents are the collaboration record. Read in that order they
explain the project to a stranger - or to a new Claude - in about twenty
minutes.

## 2. What must be carried by hand

Run this on the old machine:

```bash
node scripts/handover-pack.js
```

It writes a `handover/` folder (gitignored) holding:

**From the project** - secrets and the operator's list, all gitignored:
- `OPS-AND-MANUAL-ACTIONS.md` - Rajat's own checklist and every dashboard fact.
  **The single most valuable untracked file in the project.**
- `private/` - the Lightsail SSH key, the Google service account, two OAuth
  client secrets, the Merchant refresh token, Atlas and production env copies,
  the test-account credentials, the September audit
- `backend/.env`, `web/.env.local`, `ENV` - every API key the apps read

**From Claude's own home** (`~/.claude`) - the part that makes a new session
already know this project:
- `projects/<project>/memory/` - 28 memory files and `MEMORY.md`. This is what
  Claude has learned about how Rajat works: no `npm install` here, commit at
  milestones, the business-goal gate, which account is which, and so on
- `skills/{frontend,backend,database}/` - the three project skills. They are
  user-level, so they are NOT in the repo; without them `/frontend` and
  `/backend` do not exist on the new machine
- `settings.json` and the plugin list
- `mcp-servers.json` - the MCP servers with their keys (Firecrawl today)

**Not packed, on purpose:** `node_modules` (reinstall), and the session
transcripts in `~/.claude/projects/<project>/*.jsonl` - 700 MB, and a new
session does not read them. Copy them to an archive drive if you want the raw
history searchable; they are not needed for Claude to work.

## 3. On the Mac

```bash
# 1. the code
cd ~/Documents
git clone https://github.com/rajatmittal-359/shopmaster-pro
cd shopmaster-pro

# 2. the half that git does not carry - from the handover folder
cp -R /Volumes/<usb>/handover/project/private .   # USB, or wherever LocalSend put it
cp /Volumes/<usb>/handover/project/OPS-AND-MANUAL-ACTIONS.md .
cp /Volumes/<usb>/handover/project/ENV .
cp /Volumes/<usb>/handover/project/backend.env backend/.env
cp /Volumes/<usb>/handover/project/web.env.local web/.env.local
chmod 600 private/*.pem          # ssh refuses a key any other user can read

# 3. dependencies - Rajat runs these, never Claude
cd backend && npm ci && cd ../web && npm ci && cd ..
npx playwright install chromium   # only if the browser checks are wanted
```

**Then Claude:**

```bash
# install Claude Code, sign in as the same account
claude
```

Once it has started in the project folder, close it. A folder now exists at
`~/.claude/projects/-Users-<you>-Documents-shopmaster-pro/`. The name is the
project path with slashes turned into dashes, so it is **different from the
Windows one** - this is the step people get wrong:

```bash
cp -R /Volumes/<usb>/handover/claude/memory \
      ~/.claude/projects/-Users-<you>-Documents-shopmaster-pro/memory
cp -R /Volumes/<usb>/handover/claude/skills/* ~/.claude/skills/
```

Plugins and MCP, from `handover/claude/`:

```bash
# the marketplaces the plugins come from
claude plugin marketplace add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git
claude plugin marketplace add https://github.com/Leonxlnx/taste-skill.git
# then install what settings.json lists as enabled - see handover/claude/plugins.txt

# the MCP servers - see handover/claude/mcp-servers.json for the exact entry.
# Firecrawl here is an HTTP server, not a local command:
claude mcp add --transport http firecrawl <the url from that file>
# If it asks to sign in, sign in - that is the tech@backrr workspace one, and
# it is separate from the project's own FIRECRAWL_API_KEY in backend/.env.
```

## 4. Prove it works before trusting it

| Check | Command | Expected |
|---|---|---|
| tests | `cd backend && npm test` | 1335 passed, no database needed |
| the site builds | `cd web && npm run build` | clean |
| the box answers | `ssh -i private/LightsailDefaultKey-ap-south-1.pem ubuntu@13.207.140.197 "docker ps"` | three containers up |
| the live site | `curl -s -o /dev/null -w "%{http_code}" https://www.shopmasterpro.in` | 200 |
| Claude remembers | ask it *"what are the rules about npm install here?"* | it answers "Rajat runs them" without reading a file |
| the skills exist | `/frontend` in Claude | the skill loads |

## 5. Before the Windows laptop is reset

1. Run the pack, copy it off, **and open one file from the copy to be sure the
   transfer is not empty.**
2. Push everything: `git status` must be clean and `git push` must say
   *Everything up-to-date*.
3. The pack is full of live keys. **Windows has no AirDrop** - that is
   Apple-to-Apple only. Move it one of these ways, best first:
   - a **USB drive**, then delete the copy on it once the Mac is proved;
   - **LocalSend** (free, open source, Windows and Mac, stays on your own
     wifi) if no drive is at hand.

   Not by WhatsApp, mail or Drive - not because the transfer is unsafe, but
   because the file then lives in a chat history and in that app's cloud
   backup, which WhatsApp's Drive backup does not encrypt end-to-end by
   default. If there is genuinely no other way: 7-Zip the folder with AES-256
   and a real password, send the archive one way and the password another, and
   delete both afterwards.

   What IS fine to send over WhatsApp: screenshots, notes, the GitHub link,
   and HANDOVER.md itself - it names files, never their contents.
4. Nothing else on that laptop is needed. Every secret has a second home:
   `private/`, the box at `/srv/shopmaster/env/`, and the dashboards themselves.

## 6. What is different on a Mac

- **Line endings.** `.gitattributes` already forces LF on `*.sh`, `Dockerfile`
  and `deploy/**`, so the box keeps getting what it expects. Nothing to do.
- **`scripts/run.js`** already branches on `process.platform`, so
  `npm run server` and `npm run web` work unchanged.
- **The SSH key needs `chmod 600`** or ssh refuses it. Windows did not care.
- **Bash is the real shell**, so the PowerShell workarounds in the old
  transcripts no longer apply - and neither does "heredocs eat backslashes",
  which was a Git-Bash-on-Windows fault.
- **Docker is not needed locally.** It runs on the Lightsail box; the laptop
  only needs Node.

## 7. The five minutes that matter most

If everything else is lost, these are the files that cannot be rebuilt:

1. `private/` - keys and credentials
2. `OPS-AND-MANUAL-ACTIONS.md` - what has been done outside the code, and what
   is still owed
3. `~/.claude/projects/<project>/memory/` - how Rajat works
4. `backend/.env` and `web/.env.local` - though the box's copy at
   `/srv/shopmaster/env/api.env` can rebuild most of it

The code itself is on GitHub, and the running site is on the box. Those two are
safe whatever happens to any laptop.
