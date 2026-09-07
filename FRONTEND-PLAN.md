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

## 8. What we could not verify

Written down so nobody later mistakes it for fact:

- **Jewellery return rate ~4%** — single unverified source, and commercially the most important number here. Measure it from our own orders before writing policy around it.
- **India mobile traffic share** — StatCounter read directly says 64.45% (Aug 2026); blogs routinely attribute 76–80% to the same source. Using ~65% as a conservative floor.
- **"Sticky add-to-cart lifts mobile conversion 5–12%"** and **"Baymard thumb-zone research"** — both are widely quoted and **neither exists**. We are adding the sticky bar because all three D2C competitors have it, not because of a number.
- **Delivery-date conversion lifts (+12% to +25%)** — all vendor case studies, no controlled research.
- **Legal Metrology (Packaged Commodities) Amendment Rules 2026**, in force 1 July 2026, reportedly require country of origin, net quantity, manufacturer name and address to be displayed by e-commerce entities, and possibly a country-of-origin *filter*. Melorra, Palmonas and Myntra all show such a block today. **The gazette text could not be retrieved. This is a question for a lawyer, and it is on the CA list.**
