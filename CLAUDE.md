# ShopMaster Pro — read this first

Marketplace from Jaipur, run by Rajat Mittal. His own shop, **Charming Jewels**,
is one seller on it and also the admin account. The site is **ShopMaster Pro**;
it sells anything, and nothing in the frame may name a category.

## Which app is which

| Folder | State (12 Sep 2026) |
|---|---|
| `backend/` | Express 5 + Mongoose 9. **Live** on Render Singapore. 903 tests, `npm test`, no database needed |
| `web/` | Next.js 16 + shadcn (Base UI). **Complete, localhost only.** Replaces `frontend/` at the October cutover |
| `frontend/` | The old React app. **Still what the domain serves.** Do not build on it; delete it a week after cutover |

## The documents, and which one to open

| File | What it is | Update it when |
|---|---|---|
| `WHAT-IS-LEFT.md` | **The one list of code work that was decided and is not finished.** | Something is decided, finished, or dropped |
| `OPS-AND-MANUAL-ACTIONS.md` (gitignored) | Everything outside the code: accounts, DNS, courier, payments, and **Rajat's own checklist** — the list at the top is the current one | A dashboard fact changes or Rajat ticks a box |
| `FRONTEND-PLAN.md` | Why every page looks the way it does — the references, the decisions, the reasons. §13 is the progress table | A page is built or a decision is made |
| `web/DESIGN.md` | Tokens and rules of the visual system. Hand it to any tool or person before they touch a page | A token or rule changes |
| `README.md` | The front door for a stranger | Rarely |
| `docs/archive/` (gitignored) | The 5 Sep gap analyses. Superseded by the plan; kept for the record | Never |
| `private/` (gitignored) | Test credentials, Brevo domain notes, the Google client secret. Never commit, never print | — |

## Rules that came from Rajat, with the reason

1. **Every page comes from a market reference.** Amazon, Flipkart, Myntra,
   Meesho, Shopify admin, Seller Central, Stripe, Linear — name the reference,
   then build. Nothing invented from taste. If the research turns up a
   requirement we lack, build it, backend included.
2. **Browser only on his laptop, locally.** Playwright MCP against localhost.
   The Chrome extension is banned — a shared account once opened a tab on a
   colleague's machine. Say when a browser is running. Never log in for him.
3. **Never run `npm install` here.** It hangs the laptop. Ask him to run it.
4. **Commit at milestones**, not after every fix. Push together.
5. **Jaipur is the trust story** — same-city trust recruits sellers and buyers.
   The mark is a jharokha in Pink City pink. No lotus, no chakra, no clip-art.
6. **Ask before spending; undo after removing.** Confirmations only for costly
   or irreversible actions (booking a courier, a premium AI image); Undo toasts
   for the rest.
7. **Cleanup waits for the end** — key rotation, test-data deletion, branding
   polish. Raise once, then drop it.
8. **Answers go in the chat**, not into new `.md` files, unless a document is
   the deliverable.

## Things that bite

- Base UI: `Menu.GroupLabel` outside a `Menu.Group` throws; `Button render={<Link/>}` needs `nativeButton={false}`.
- Lightning CSS drops hand-written `backdrop-filter`; use `@apply backdrop-blur-lg backdrop-saturate-150`.
- `react-hooks/set-state-in-effect`: fetch in a promise chain inside the effect, never `setState` synchronously in its body.
- Bash heredocs eat backslashes on this machine; write files with the Write tool or python.
- AI image quotas are real money-shaped: Cloudflare 10k neurons/day (the only daily free edit source), Pollinations has **no** daily grant, HF ≈3 edits/month. Test with mocks; heavy models 2–3 real calls a day at most.
- Gemini text: `gemini-3.5-flash` pinned with retry; image generation needs billing (his card is refused by Google Cloud).
