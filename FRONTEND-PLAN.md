# The new front end — what we are building, and why

**Decided:** 7 September 2026
**Stack:** Next.js 16.3.4 · React 19.2.8 · Tailwind v4 · shadcn/ui (Base UI, Nova) · JavaScript
**Lives in:** `web/` — `frontend/` keeps serving the site until cutover

This document is the decision record. It is written so that building each page
is a matter of following it, not re-arguing it. Everything below is either
measured from this codebase, quoted from a primary source, or marked as a
judgement call.

---

## 1. Why we are doing this at all

One sentence: **Google Merchant Center will not read structured data that
JavaScript creates.**

Google's own words, from [Set up structured data for Merchant
Center](https://support.google.com/merchants/answer/7331077):

> "Structured data markup must be present in the HTML returned from the web
> server. The structured data markup **can't be generated with JavaScript**
> after the page has loaded."

Googlebot-for-Search *does* render JavaScript, so the same markup can be visible
to Search and invisible to Shopping. That is the trap the shop is in today.

And the AI crawlers are worse. Vercel + MERJ instrumented real traffic and found
**GPTBot, ClaudeBot, PerplexityBot and Meta's crawler execute no JavaScript at
all** — GPTBot fetches JS files 11.5% of the time and never runs them. Only
Googlebot and AppleBot render. So a client-rendered product page gives ChatGPT
and Claude an empty `<div id="root">` and nothing else.

*(That study is from late 2024 and has not been re-run at the same scale. 2026
re-tests by EdgeComet and Wislr reach the same conclusion on smaller samples.
Direction: solid. Dates: stale.)*

**So: the nine public pages get server-rendered HTML. That is the whole point.**
The thirty private pages stay client-side, which is correct anyway — the auth
token lives in `localStorage` and no server can read it.

---

## 2. What is wrong today, measured

Found in this repo, not assumed:

| | Fault | Consequence |
|---|---|---|
| 🔴 | **Sorting is a lie.** `routes/productRoutes.js` hard-codes `.sort({createdAt:-1})` and takes no sort param. `HomePage.jsx:136` then re-sorts *only the current page*. | "Price: low to high" shows the cheapest of 12, not the cheapest of 51 |
| 🔴 | **No delivery date anywhere.** `utils/shipping.js` has `getDeliveryOptions()` but no public endpoint exposes it | All seven Indian jewellery sites we studied show a pincode delivery check above the fold. We have the data and hide it |
| 🔴 | **Feed is missing `color`, `gender`, `age_group`** — required by Google for free listings in category 166, which is where jewellery sits | 17 products sitting in "Under review" |
| 🟡 | **`/` is a redirect to `/shop`.** There is no home page | The strongest page on most sites does not exist here. Search Console's "Page with redirect: 2" is partly this |
| 🟡 | Product page has no breadcrumbs, no related products, no sticky mobile buy bar | All seven competitors have all three |
| 🟢 | Product page bones are sound — gallery with the video first, name, rating, price, quantity, trust, description, reviews | Structure survives; presentation changes |
| 🟢 | UI kit is six primitives (Badge, Button, Card, EmptyState, Modal, StatCard) | Small enough that shadcn replaces it cleanly |

---

## 3. Decisions, with the reason attached

### 3.1 JavaScript, not TypeScript
The whole codebase is JS; thirty private routes have to be ported by hand on
weekends. shadcn supports JS natively (`"tsx": false` in `components.json`
writes `.jsx`), so the usual argument for TS does not apply. TS can arrive later,
file by file — Next.js runs both.

### 3.2 Base UI, not Radix
shadcn's own CLI marks Base UI "(Recommended)" and its new components and docs
are written against it. Fighting the recommended path costs more than it saves
at one day a week.

### 3.3 Cache Components (`use cache`) — **OFF**
It is stable and unprefixed in Next 16, and we are still not turning it on:

- **Memory leak #97776** — `use cache` leaks ~84–150 MB/hour, OOM at ~18.5h.
  Broken in 16.3.0 and 16.3.2, fixed only in 16.4.0-canary.1. **Not backported
  to 16.3.x**, which is what we run.
- **#86577** — `<Activity>` keeps hidden routes mounted, so dropdowns and
  dialogs stay open across navigation. That is a direct hazard to a
  shadcn/Base UI interface.
- Next's own docs note that with Cache Components enabled, crawlers get the page
  rendered dynamically rather than from the shell — *"a page that loads for a
  person can fail to render for a crawler."* That is the exact opposite of what
  this migration is for.

Without it, `export const revalidate`, `generateStaticParams`, `revalidateTag`
and the rest all still work. Next's docs call this the "Previous Model" and
maintain it. **Revisit at 16.4.**

### 3.4 Rendering strategy per route

| Route | Strategy | Why |
|---|---|---|
| `/products/[slug]` | `generateStaticParams` + `revalidate` | 51 pages, static HTML, best TTFB. Price and stock refresh on revalidate |
| `/shop` | Server-rendered per request | Filters and sort are query params; caching them all is pointless at 51 products |
| `/` | Static, revalidated | Content changes rarely |
| 6 policy pages | Fully static | They change when we change them |

**`revalidateTag` now takes two arguments** in Next 16 — `revalidateTag('products', 'max')`. The one-argument form is deprecated and invalidation becomes *eventual*, not immediate. For read-your-writes use `updateTag()` in a Server Action.

### 3.5 What we are deliberately NOT doing

- **`llms.txt`** — Ahrefs studied 137,210 domains: **97% of llms.txt files got zero requests in May 2026**, and *"zero requests came from AI bots for llms.txt files that don't exist. They never go looking."* Google's John Mueller: *"no AI system currently uses llms.txt."* Dead weight.
- **FAQPage markup** — FAQ rich results stopped appearing 7 May 2026 and the documentation was removed. We can still write an FAQ *section* for humans; we will not pretend the markup earns anything.
- **360° spin viewers** — none of the seven Indian jewellery sites in the ₹400–9,000 band use one.
- **Size filters / size charts** — Google requires `size` only for Clothing (1604) and Shoes (187), not jewellery. The Indian pattern is to design the problem away: GIVA writes *"Adjustable size to ensure no fitting issues."*
- **A 39-value colour filter** — that is a 200-SKU pattern. See §4.2.

---

## 4. The pages

### 4.1 `/products/[slug]` — the money page

Order is taken from what all seven of giva.co, salty.co.in, palmonas.com,
melorra.com, bluestone.com, caratlane.com and Myntra do, in the order they do it.

```
breadcrumb
gallery  ·  title
price block: sale + strikethrough MRP + % off + "inclusive of all taxes"
rating + review count
stock line (only when genuinely low)
PINCODE DELIVERY CHECK          ← new; all 7 have it, we have the data
trust strip
quantity + Add to cart + Wishlist
description: design → key details → care → styling tip
reviews, with the distribution and not just the average
related products
```

**Server component** renders everything above except the cart/wishlist/quantity
controls and the pincode box, which are small client islands. Price, stock,
title, brand, description and enough review text to be quotable must be in the
first HTML byte stream.

**Why each new piece is there:**

- **Breadcrumb** — Google made breadcrumb rich results desktop-only in Jan 2025, but it remains a hierarchy signal, and five of the seven competitors keep it.
- **Pincode delivery check** — every one of the seven has it. `getDeliveryOptions()` already computes this; it needs a public endpoint. All the conversion evidence for delivery dates is vendor case studies, so treat the *number* sceptically — but the consistent finding is that **specificity** wins: "arrives Thursday 12 September" beats "ships in 3–5 days".
- **Gallery** — Baymard: **56% of users' first action on a product page is exploring the images**, and **42% try to judge size from them**. Two rules follow, both cheap: at least one image showing the piece **worn on a person** (Baymard: jewellery *"requires the context of a human model"* to convey scale), and one **dimension slide** with measurements drawn on it. Salty already does the second inside its gallery.
- **Mobile thumbnails** — Baymard: **76% of mobile sites omit thumbnails for additional images**, and thumbnails produce the *lowest* rate of unintentional taps of any indicator. All three D2C brands run a fixed bottom add-to-cart bar at 390px. We will too.
- **Return policy, linked from the product content** — Baymard: **60% of users look for the return policy on the product page** and **15% abandon over an unsatisfactory one**; **44% of sites don't link it** from the main product content. This is the cheapest fix in the document.
- **Reviews** — Spiegel Research Center (Northwestern, transaction data): **five reviews raise purchase likelihood 270%** over zero, and the marginal gain flattens after about five. Two consequences: getting the *first five* reviews on a product matters more than anything else about reviews, and **we show the distribution, not just the average** — the same research found purchase likelihood *peaks at 4.0–4.7 stars and falls toward 5.0*, because a perfect score reads as fake. LocalCircles (64,000 responses across 314 Indian districts) found **56% of Indians don't trust written reviews and 59% who posted a negative review said it was never published**. So: verified-purchase badges, dates, published negatives.
- **Material disclosure** — the imitation-jewellery axis in India is *anti-tarnish / skin-safe / nickel-free / plating warranty*, not hallmarking. Palmonas leads with "Anti tarnish · Skin Safe Jewellery"; GIVA writes "Perfect for sensitive skin". Our descriptions already say "imitation jewellery" plainly, which is both honest and legally safer.

### 4.2 `/shop` — the listing

**Filters: Price, Category, Colour, and Rating once reviews exist. That is all.**

Baymard's five essential filters are Price, Rating, Colour, Size and Brand.
Brand is excluded by their own rule on a single-brand site; Size is moot on
adjustable jewellery. **80% of users apply a price filter** regardless of
product type — that one is not optional. Rating is the biggest industry gap:
45% of users treat reviews as a key factor and **only 47% of sites offer the
filter**.

Also fixed here:

- **Sorting moves to the server.** A new `sort` parameter on the products endpoint. The current behaviour is wrong at any catalogue larger than one page.
- **A real "no results" state.** Baymard: *"nearly 50% of sites fail to provide users with effective ways to recover from a search that yields no results."* Salty's is worse than nothing — filter to an impossible price and the grid simply renders empty with no message. Ours will show what was searched, offer to clear each filter individually, and show popular products.
- **Applied filters shown as removable values, not a count.** Baymard: 28% of sites omit this entirely, **66% on mobile**.
- **Numbered pagination with `rel="next"`.** Nobody in the seven uses pure infinite scroll. Load-more is fine for humans but must stay crawlable.

### 4.3 `/` — a real home page

Currently a redirect. It becomes a page: what the shop is, the categories, a
few products, and the Charming Jewels story with the real Jaipur address. The
`Organization` structured data lives here — and since 2026 that is also where
`hasMerchantReturnPolicy` and `hasShippingService` belong.

### 4.4 The six policy pages
Straight ports to server components. They already read their numbers from
`config/policy.js`, which has moved to `web/src/config/policy.js` unchanged.

---

## 5. Structured data

GIVA's markup is the reference implementation for an Indian jewellery store and
we will match its shape: `Organization` + `Product` + `BreadcrumbList`, with
`ItemList` on the listing.

**Product / merchant listing** — required: `name`, `image`, `offers`.
Recommended and worth having: `brand.name`, `sku`, `mpn`, `description`,
`color`, `material`, `aggregateRating`, `review`, `category`.

**Offer** — required: `price`, `priceCurrency`. Recommended: `availability`,
`itemCondition`, `url`, `shippingDetails`, `hasMerchantReturnPolicy`.

**No GTIN, and that is fine.** Merchant Center: *"If you're the only seller of a
product or if your product is a store brand, it generally won't have a GTIN."*
We already send `identifier_exists: no`. Accept that seller-cluster experiences
are out of reach; product snippets, popular products and Images are not.

**The rule that governs all of it:** never let a fact exist *only* in schema.
searchVIU built a page with eight prices in eight locations and asked five AI
systems to find them — the price that existed only in JSON-LD **was found by
none of them**, Claude found zero of eight overall. And Ahrefs' difference-in-
differences study of 1,885 pages that added schema found **no citation uplift on
any platform** (AI Overviews actually −4.6%). Schema earns rich results and
feeds Merchant Center. It does not talk to AI. **Visible text does.**

---

## 6. Next.js 16 traps to avoid

Each of these is documented and each would cost a weekend to find:

- **Do the "does this product exist" check before any `await`** in `/products/[slug]`. Once streaming starts the response is committed to 200; a `notFound()` after that cannot become a 404 — Next injects `<meta name="robots" content="noindex">` instead and the docs warn *"some crawlers may label these responses as 'soft 404s'."*
- **Never put the LCP element inside a `<Suspense>`** — it cannot paint until the boundary resolves. Next's docs say so outright.
- **`next/image` needs `sizes`.** Without it the browser assumes `100vw` and downloads an oversized image, which is an LCP problem on exactly the mobile connections we care about.
- **`middleware.ts` is now `proxy.ts`** — rename the file *and* the export. Node runtime only.
- **`revalidateTag` takes two arguments now.** See §3.4.
- **Do not pin below 16.3.4.** 16.3.3 shipped two unauthenticated RCE fixes, one in the Image Optimization API.
- **Turbopack CSS ordering, issue #83941** — cascade order can differ between `next dev` and `next build`, open since Sept 2025, non-deterministic. This directly threatens Tailwind + shadcn. **Check the production build visually, not just dev.**
- **`next lint` is gone**; `next build` no longer lints. CI must run ESLint itself.
- Async request APIs are fully removed with no compatibility period, and the `upgrade` codemod does *not* migrate them.

---

## 7. Order of work

Each step ships independently. `frontend/` stays live throughout.

| | Step | Why here |
|---|---|---|
| 1 | **Feed: add `color`, `gender`, `age_group`** | Not frontend, but it is live risk to 17 products in review. Do it first |
| 2 | Layout, header, footer, the six policy pages | Smallest surface, proves the shell |
| 3 | `sort` on the products API + a public delivery-estimate endpoint | Both pages need them; both are backend |
| 4 | `/products/[slug]` | The money page |
| 5 | `/shop` | How people reach it |
| 6 | `/` | New page, no existing behaviour to preserve |
| 7 | Port the 30 private routes | Mechanical: `'use client'`, `useNavigate`→`useRouter`, `<Link to>`→`<Link href>` |
| 8 | Cutover: point the domain at `web/`, delete `frontend/` | One copy of everything again |

**Not in this plan, deliberately:** payment, checkout logic, seller and admin
behaviour. Those pages get ported, not redesigned. The money paths are correct
and heavily tested; changing them while changing the framework would make any
failure impossible to attribute.

---

## 7a. This is two projects, not one — keep them apart

Half of what follows is **backend architecture**, not front end:

    User.role becomes a capability, not an identity
    the JWT changes shape
    roleMiddleware changes
    Google sign-in is a new auth path
    the products endpoint gains a sort parameter
    a public delivery-estimate endpoint appears

The other half is the interface. **They ship in separate commits.** If auth and
design change together and something breaks, there is no way to tell which one
did it - and auth is the part where a mistake logs the wrong person into the
wrong account.

---

## 7b. Third-party services — what we actually need

| Service | Verdict | Why |
|---|---|---|
| **Sentry** | **Yes** | There is no error tracking of any kind today. A 500 at checkout is invisible: Render's logs are ephemeral and nobody reads them. Free tier is 5,000 errors a month, which is more than this shop will produce. Smallest effort, largest blind spot removed |
| **Firebase (FCM)** | **Later, only for web push** | "Your order has shipped" as a browser notification. Free, but needs a service worker and a permission prompt, and it is worth nothing until there are orders to notify about. Not now |
| **Google Drive API** | **No** | Nothing to put in it. Product images are on Cloudinary, invoices are generated from the order, backups belong to Atlas. It would be a dependency in exchange for nothing |
| **Gemini** | **Already in** | Writes product descriptions. Free tier ran out at 16 products in one day, so the remaining 35 finish on a later day. Worth paying for only when drafting is a daily job rather than a one-off |

---

## 7c. The brand colour contradiction

`frontend/src/index.css` carries a comment saying:

> *"Marigold is kept deliberately - it is already the brand, and it is Jaipur's
> own colour, which is where this shop actually is."*

The values beneath it are **Tailwind blue** (`#2563eb`). At some point the ramp
was replaced and the comment was left behind, so the file argues for one colour
and ships another.

**Decision: go back to marigold.** Blue is the default every dashboard ships
with; it says "software". A warm gold says jewellery, and it sits with the
product photography instead of fighting it. The accessibility work in that
comment stands either way - the readable step is `-700`, not `-500`.

**The mark:** a cut stone - a table over a pavilion, two facet lines. Drawn as
SVG in `currentColor` so the header, a black invoice, a dark footer and the
favicon are one file rather than four that drift. `web/src/components/brand/Logo.jsx`.

---

## 8. Signing in

### 8.1 Google, on our own session — not NextAuth

**How it works.** Google Identity Services renders the button and One Tap; the
browser shows the accounts already signed in on that device. On success GIS
hands us an **ID token (a JWT)**. That token goes to `POST /api/auth/google` on
Express, which verifies it with `google-auth-library` (`verifyIdToken`, audience
= our client ID) and then issues **our own** session cookie, exactly like the
password path does today.

**FedCM is the transport, not a replacement.** Chrome now runs One Tap over
FedCM because third-party cookies are gone. The API we call is unchanged; what
changes is that the account chooser is drawn by the browser. Nothing to migrate.

**Key on `sub`, never on email.** `sub` is Google's permanent user id. Email can
change, and a Workspace admin can reassign an address to a different person —
matching on email is how one person ends up inside another's account. Store
`googleId = sub`; use email only to *link* to an existing account, and only when
`email_verified` is true.

**No NextAuth / Auth.js.** It would create a second source of truth for sessions
alongside the Express JWT we already issue, and every authorisation check in the
backend reads that JWT. Auth.js is also in maintenance mode — Better Auth took
over in Sept 2025 (Vercel acquired it July 2026). Adding a dependency in
maintenance to duplicate something that works is two mistakes.

**Email/OTP stays.** A link opened inside the Instagram or Facebook in-app
browser gets `403 disallowed_useragent` from Google — those webviews are blocked
outright. Instagram is where this shop's traffic will come from, so Google
sign-in can never be the only door.

**One manual step, and it is a hard gate:** the OAuth consent screen must be
published to **In production**. While it is in *Testing*, sign-in is capped at
100 users and consent expires every 7 days — customers would be silently logged
out each week.

### 8.2 What the screens are

| Screen | What it holds |
|---|---|
| Sign in | Google button first, then email + password. Not a modal — a real route, so it can be linked to and returned from |
| Create account | Same two paths. Nothing about selling appears here |
| Forgot password | Already exists; carried over |

There is no "sign up as a seller" choice anywhere on these screens. See section 9.

---

## 9. One account, two roles

### 9.1 The change

Today `User.role` is a single enum, so an identity *is* a role and one email
cannot both buy and sell. Rajat's own family shop is a seller on this platform
and also a customer of it — the model contradicts the business it runs.

**Role becomes a capability, not an identity.** The `Seller` document already is
the capability record: it carries `isApproved`, `kycStatus`, `status`. Nothing
new needs inventing. The user has a seller capability if a Seller document
exists for them and is approved.

- The JWT carries the **active context**, not the user's permanent nature.
- `POST /api/auth/switch-context` re-reads the Seller record from the database
  and re-mints the token. It never trusts a context the client asks for.
- No endpoint reads a role from the request body. (OWASP calls the opposite
  pattern broken function-level authorisation; it is the most common way a
  marketplace gets a fake seller.)

**Evidence this is how it is done:** Etsy — *"You'll use this account to run your
shop and to buy from other makers on Etsy."* eBay: personal → business is an
account-type **upgrade**, one way. Auth0, Clerk and WorkOS all model this as a
membership record attached to a user, never as a field on the user. Nobody
ships `role: buyer | seller`.

### 9.2 What the interface does with it

One account, one sidebar, and the sidebar's contents come from what the account
can do:

- Customer only → orders, wishlist, addresses, and a single **"Sell on
  ShopMaster Pro"** entry at the bottom.
- Seller (approved) → a context switcher at the top of the sidebar. Switching is
  a page change, not a different login.
- Seller (pending) → the switcher shows, disabled, with the application status.
- Admin → unchanged; it stays a separate area.

### 9.3 Logged out

A visitor who has never signed in sees the customer sidebar and can browse
`/shop`, open any product, and add to cart. Sign-in is asked for at **checkout**
and nowhere earlier — a marketplace that demands a login before it shows a price
has no chance of a Google click converting.

> **Not researched.** The agent tasked with logged-out marketplace navigation
> died on a session limit. The above is a judgement call from how Amazon,
> Flipkart and Myntra behave, not from a written source. Cheap to change later.

---

## 10. Becoming a seller — an upgrade, not a signup

Reached from **"Sell on ShopMaster Pro"** inside an account that already exists.
The person is already signed in, so we ask only for what selling needs.

**Two tracks, because most small Jaipur sellers have no GSTIN:**

| Track | Who | What it means |
|---|---|---|
| **GSTIN** | Registered sellers | Normal. Sells anywhere in India |
| **Enrolment number** (Notification 34/2023) | Turnover under ₹40 lakh, PAN, no GSTIN | **Intra-state only** — a hard lock in code, not a warning in a paragraph. Rajasthan buyers only |

**A GST finding that closes off a route we discussed:** imitation jewellery is
**HSN 7117 — 3% GST, taxable, not exempt** (Notification 09/2025-CTR, Schedule
IV). The "sell only GST-exempt goods so no registration is needed" path does not
exist for this catalogue. Only lac/shellac, glass and plastic bangles are
nil-rated. **On the CA list.**

---

## 11. A CMS — not yet

Verdict: **premature.** ~50 products and six static pages do not justify one.
The trigger for a CMS is *a non-technical person who needs to publish*, not a
number of pages — and today the only publisher is the developer.

For the record, so it isn't re-researched: Sanity Free and Contentful Free are
both genuinely $0 and would work. Strapi Cloud has no free tier. Payload is MIT
and self-host only (and has joined Figma). None of that changes the verdict.

---

## 12. Hosting the Next app — what to create, when, and what it costs

### What exists today, and it is right

| Service | Type | Plan | Carries |
|---|---|---|---|
| `shopmaster-pro` | **Static Site** | Free | `shopmasterpro.in` + `www.shopmasterpro.in`, both verified, both with certificates. Apex redirects to www |
| `shopmaster-api` (Singapore) | Web Service | Free | `shopmaster-api-sg.onrender.com` |
| `shopmaster-api` (Virginia) | Web Service | Free | The old API. Delete once Singapore has run clean for a few days |

The DNS is two CNAMEs (`@` and `www`) at Hostinger pointing to
`shopmaster-pro.onrender.com`, with `216.24.57.1` as the A-record alternative.
That is exactly how Render's own documentation says to do it, and both are
showing *Verified · Certificate Issued*. **Nothing here was done wrong.**

The React app reads exactly two environment variables, and both are correct:
`VITE_API_URL` (the Singapore API) and `VITE_RAZORPAY_KEY_ID`. The Razorpay
**key id** is public by design — it is meant to be in the browser. The *secret*
is not here, and must never be.

### Why the Next app cannot simply take a free service

A static site is always on. A **free Web Service is not**: it spins down after
15 minutes of no traffic, and the next request waits ~50 seconds for it to wake.

Googlebot treats a server that takes 50 seconds as an unhealthy one, and it
crawls a shop with a handful of visitors a day at exactly the times it is
asleep. Moving to Next in order to be indexed better, and landing on a service
that is asleep whenever Google calls, would leave us **worse off than the
static site we already have**.

> *Recorded earlier and NOT re-verified today: that Render also serves a
> `Disallow: /` robots.txt for a spun-down free service. The cold start alone
> settles the decision, so this was not worth re-testing.*

**Static export (`output: 'export'`) is not the way out.** It would give up
exactly what we moved for: pages rendered per request, on-demand revalidation
when a price or stock changes, and the API proxying the product page needs.

### So the plan is

| When | What |
|---|---|
| **Now → the pages are built** | Nothing on Render. `npm run dev` locally is enough, and every page so far is static HTML anyway |
| **Optional, any time** | A **free** Web Service named `shopmaster-web`, on its `onrender.com` subdomain, **no custom domain**, so it can be opened on a phone. It must ship `noindex` while it is a preview: two copies of the shop in Google's index is a self-inflicted duplicate-content problem |
| **Cutover, October 2026 at the earliest** | Upgrade that service to **Starter (~$7/mo)** and move the domain to it. It cannot happen sooner: the card was removed from the workspace and Render will not accept a new one until **1 Oct 2026** |

### The cutover, in order — nothing here is guesswork

1. Next service on **Starter** and confirmed awake on its `onrender.com` URL
2. Its environment set: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`,
   `NEXT_PUBLIC_SITE_URL=https://www.shopmasterpro.in`
3. `noindex` removed
4. Move `www.shopmasterpro.in` **and** `shopmasterpro.in` from the static site
   to the Next service; re-verify both, wait for both certificates
5. Watch Search Console for a week. **Keep the static site running** — it is
   free, and it is the way back if something is wrong
6. Only then delete `frontend/` from the repo

**The one thing that must not change across the cutover: the URLs.** Every
product URL, every category URL and all six policy URLs stay exactly as they
are. A redesign that also renames pages throws away whatever ranking those
pages have earned, and this shop cannot afford to lose any.

---

## 13. Where the work has actually reached

Updated as it moves. The order is section 7's.

| # | Step | State |
|---|---|---|
| 1 | Feed: `color`, `gender`, `age_group` | ✅ Live and verified — 17 items, 16 with a colour |
| 2 | Layout, header, footer, six policy pages | ✅ Built, all static. Not yet on a domain |
| 3 | `sort` on the products API + public delivery estimate | ✅ Built, 791 tests |
| 4 | `/products/[slug]` — the money page | ⏳ **next** |
| 5 | `/shop` | ☐ |
| 6 | `/` | ☐ |
| 7 | Port the 30 private routes | ☐ |
| 8 | Cutover - see section 12 | ☐ Blocked until Oct 2026 (payment) |

Backend work that the interface needs but that ships separately (section 7a):
Google Sign-In, role-as-capability, seller onboarding. None started.

---

## 14. What we could not verify

Written down so nobody later mistakes it for fact:

- **Jewellery return rate ~4%** — single unverified source, and commercially the most important number here. Measure it from our own orders before writing policy around it.
- **India mobile traffic share** — StatCounter read directly says 64.45% (Aug 2026); blogs routinely attribute 76–80% to the same source. Using ~65% as a conservative floor.
- **"Sticky add-to-cart lifts mobile conversion 5–12%"** and **"Baymard thumb-zone research"** — both are widely quoted and **neither exists**. We are adding the sticky bar because all three D2C competitors have it, not because of a number.
- **Delivery-date conversion lifts (+12% to +25%)** — all vendor case studies, no controlled research.
- **Legal Metrology (Packaged Commodities) Amendment Rules 2026**, in force 1 July 2026, reportedly require country of origin, net quantity, manufacturer name and address to be displayed by e-commerce entities, and possibly a country-of-origin *filter*. Melorra, Palmonas and Myntra all show such a block today. **The gazette text could not be retrieved. This is a question for a lawyer, and it is on the CA list.**
- **Logged-out marketplace navigation** and **the seller/admin panel gaps against Amazon, Flipkart, Myntra and Meesho** - both research passes were cut off by a session limit and never returned findings. What section 9.3 says about logged-out browsing is reasoning from competitor behaviour, not a sourced finding. Worth a re-run before the sidebar is built.
