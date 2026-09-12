# ShopMaster Pro

A multi-seller marketplace from Jaipur, live at
[shopmasterpro.in](https://www.shopmasterpro.in). Sellers list and fulfil their
own products; the platform takes a commission, books the courier, and settles
the payout once the return window has closed. Sellers get AI help with the
listing text and the product photographs.

Start with `CLAUDE.md` — it says which app is live, which document holds what,
and the working rules.

## What is in this repository

| Folder | What it is |
|---|---|
| `backend/` | Express 5 + Mongoose 9 API. Orders, fulfilment, returns and exchanges, payouts, the Google product feed and the sitemap, the AI listing and image tools. 903 tests |
| `frontend/` | The React (Vite) app that is **live today** |
| `web/` | Its replacement: Next.js 16 App Router + shadcn. **Complete**, waiting for the October cutover. `FRONTEND-PLAN.md` has the why; `web/DESIGN.md` the visual system; `WHAT-IS-LEFT.md` the remaining code work |

Two frontends is a migration, not a mistake. `frontend/` stays live until the
domain moves to `web/`, then it is deleted.

## Why the move to Next

Google Merchant Center and Razorpay's website check read HTML. They do not run
our JavaScript — Merchant Center says so outright about structured data — and
neither do the AI crawlers. A client-rendered app hands all of them an empty
page. The Next app renders the pages that matter on the server.

## Services it talks to

Razorpay (payments and refunds) · Shiprocket (courier, forward and reverse) ·
Brevo (email) · Cloudinary (images) · MongoDB Atlas, Mumbai · Gemini (listing
text) · Cloudflare Workers AI, Pollinations, Hugging Face (product photo edits) ·
Render, Singapore (hosting)

## Running it

Each app carries its own `package.json`.

```bash
cd backend  && npm install && npm run dev    # needs backend/.env - see .env.example
cd frontend && npm install && npm run dev
cd web      && npm install && npm run dev
```

```bash
cd backend && npm test                       # 903 tests, no database required
```

Every push runs the backend tests and the frontend build in GitHub Actions, and
Render deploys only after those pass.
