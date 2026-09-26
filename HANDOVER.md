# Moving ShopMaster Pro to the Mac

Rajat's runbook. Written 26 September 2026; Claude keeps it up to date as the
project changes, so read it fresh on the day rather than from memory.

`git clone` brings the code and the reasoning. It does **not** bring the
secrets, your own checklist, or anything Claude has learned - and that second
half is what makes a new session useful on day one instead of in week three.
`node scripts/handover-pack.js` collects exactly that half into one folder.

---

# Your steps, in order

## A · On the Windows laptop (10 minutes, any time before the reset)

- [ ] **1. Make the pack**
  ```bash
  cd "c:/Users/Admin/Documents/my project/shopmaster-pro"
  node scripts/handover-pack.js
  ```
  It prints what it packed. It should end with `private/`, the checklist, three
  env files, 28 memory files and three skills. About 14 MB.

- [ ] **2. Check nothing is left behind in git**
  ```bash
  git status          # must say: nothing to commit, working tree clean
  git push            # must say: Everything up-to-date
  ```

- [ ] **3. Carry the `handover` folder to the Mac** - USB drive, or
  [LocalSend](https://localsend.org) (free, both platforms, stays on your own
  wifi). **Not WhatsApp, mail or Drive**: the pack is full of live keys, and
  those apps keep a copy in a chat history and a cloud backup you cannot fully
  wipe. If there is truly no other way, 7-Zip it with AES-256 first and say the
  password out loud, not in the chat.

- [ ] **4. Open one file from the copy on the Mac** before you wipe anything -
  `MANIFEST.md` will do. An empty transfer looks exactly like a good one until
  you look.

- [ ] **5. Then the laptop can be reset.** Delete the `handover` folder from
  Windows first. Nothing else on that machine is needed: every secret has a
  second home in `private/`, on the box at `/srv/shopmaster/env/`, and in the
  dashboards themselves.

## B · On the Mac (about 30 minutes, most of it waiting for npm)

- [ ] **1. The code**
  ```bash
  cd ~/Documents
  git clone https://github.com/rajatmittal-359/shopmaster-pro
  cd shopmaster-pro
  ```

- [ ] **2. The half git does not carry.** Replace `~/Downloads/handover` with
  wherever you put the pack (a USB is usually `/Volumes/<name>/handover`).
  ```bash
  P=~/Downloads/handover
  cp -R $P/project/private .
  cp $P/project/OPS-AND-MANUAL-ACTIONS.md .
  cp $P/project/ENV .
  cp $P/project/backend.env   backend/.env
  cp $P/project/web.env.local web/.env.local
  chmod 600 private/*.pem
  ```
  `chmod` matters: macOS refuses an SSH key that other users could read.

- [ ] **3. Dependencies - you run these, not Claude**
  ```bash
  cd backend && npm ci && cd ../web && npm ci && cd ..
  npx playwright install chromium     # only if you want the browser checks
  ```

- [ ] **4. Claude Code**: install it, sign in with **tech@backrr.com** (the same
  account as here), then run `claude` once inside the project folder and quit.
  That creates its folder for this project.

- [ ] **5. Give Claude its memory and the three skills.** Find the exact folder
  name first - it is built from the path, so it differs from the Windows one:
  ```bash
  ls ~/.claude/projects/                       # find the shopmaster-pro one
  D=~/.claude/projects/<the-one-you-just-saw>
  cp -R ~/Downloads/handover/claude/memory $D/memory
  cp -R ~/Downloads/handover/claude/skills/* ~/.claude/skills/
  ```
  **This is the step people skip, and then Claude knows nothing.**

- [ ] **6. Plugins and MCP.** `handover/claude/plugins.txt` lists what was on.
  Add the two marketplaces first:
  ```bash
  claude plugin marketplace add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git
  claude plugin marketplace add https://github.com/Leonxlnx/taste-skill.git
  ```
  then install the ones marked `ON`. Firecrawl's MCP is an HTTP server, not a
  local command - the entry is in `handover/claude/mcp-servers.json`:
  ```bash
  claude mcp add --transport http firecrawl <the url from that file>
  ```
  If it asks you to sign in, that is the tech@backrr workspace one; it is
  separate from the project's own `FIRECRAWL_API_KEY` in `backend/.env`.

- [ ] **7. Prove it before trusting it**

  | Check | Command | Expected |
  |---|---|---|
  | tests | `cd backend && npm test` | 1335 passed, no database needed |
  | the site builds | `cd web && npm run build` | clean |
  | the box answers | `ssh -i private/LightsailDefaultKey-ap-south-1.pem ubuntu@13.207.140.197 "docker ps"` | three containers up |
  | the live site | `curl -s -o /dev/null -w "%{http_code}" https://www.shopmasterpro.in` | 200 |
  | Claude remembers | ask it *"is project me npm install ka kya niyam hai?"* | it says you run them, without reading a file |
  | the skills are there | type `/frontend` in Claude | the skill loads |

- [ ] **8. Delete the pack from the Mac** once all six checks pass.

---

# What is in the pack, and why

**From the project** - all gitignored, all necessary:

| | |
|---|---|
| `private/` | the Lightsail SSH key, the Google service account, two OAuth client secrets, the Merchant refresh token, Atlas and production env copies, the test-account credentials, the September audit |
| `OPS-AND-MANUAL-ACTIONS.md` | your own checklist and every dashboard fact. **The most valuable untracked file in the project** |
| `backend/.env`, `web/.env.local`, `ENV` | every API key the apps read |

**From `~/.claude`** - the part that makes a new session already know this
project:

| | |
|---|---|
| `memory/` (28 files) | what Claude has learned about how you work: no `npm install` here, commit at milestones, the business-goal gate, which account is which |
| `skills/{frontend,backend,database}` | the three project skills. They are user-level, so the repo never had them - without these `/frontend` and `/backend` do not exist |
| `settings.json`, `plugins.txt`, `mcp-servers.json` | the tools and how they were wired |

**Left out on purpose:** `node_modules` (reinstall), and the session
transcripts (~700 MB). A new session does not read transcripts; the memory
files and the documents are what carry the knowledge. `--history` adds them if
you ever want the raw archive on a drive.

# What travels by itself

`git clone` brings the product and the whole record of why it is the way it
is. Read these five in this order and the project explains itself in twenty
minutes:

1. `CLAUDE.md` - the rules, each with its reason
2. `OPS-AND-MANUAL-ACTIONS.md` *(from the pack)* - what has been done outside
   the code and what is still owed
3. `WHAT-IS-LEFT.md` - the one list of decided, unfinished work
4. `FRONTEND-PLAN.md` - the dated entries: why every page looks the way it does
5. `web/DESIGN.md` - tokens and the rules of the visual system

Plus `.claude/project-rules/{frontend,backend,database}.md`, which the three
skills read before they do anything.

# What is different on a Mac

- **The SSH key needs `chmod 600`** or ssh refuses it. Windows did not care.
- **Bash is the real shell**, so two old workarounds stop applying: the
  PowerShell detours, and "heredocs eat backslashes" - that was a
  Git-Bash-on-Windows fault.
- **Line endings** are already handled: `.gitattributes` forces LF on `*.sh`,
  `Dockerfile` and `deploy/**`, so the box keeps getting what it expects.
- **`scripts/run.js`** already branches on `process.platform`, so
  `npm run server` and `npm run web` work unchanged.
- **Docker is not needed locally** - it runs on the Lightsail box; the laptop
  only needs Node.

# If something is missing later

Nothing here is the only copy:

- the code is on GitHub, and the running site is on the box
- most keys exist again in `/srv/shopmaster/env/api.env` on the box
- every dashboard (Razorpay, Shiprocket, Brevo, Cloudinary, Atlas, Google) can
  reissue its own key - and the end-of-project rotation in
  `OPS-AND-MANUAL-ACTIONS.md` will replace them all anyway

The two things that genuinely cannot be rebuilt are `OPS-AND-MANUAL-ACTIONS.md`
and Claude's `memory/`. Carry those twice if you carry anything twice.
