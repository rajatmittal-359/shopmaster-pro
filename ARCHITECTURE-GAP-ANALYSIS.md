# ShopMaster Pro — Architecture & Gap Analysis

**Date:** 5 September 2026
**Method:** web research on how Amazon / Flipkart-class platforms are built, plus a
full read of this repository (backend + frontend), plus live probes of
`www.shopmasterpro.in` and its sitemap.

This document is deliberately blunt about what is missing. It is **not** a
criticism of the code that exists — the business logic in this repo is better
than most solo-built marketplaces. The gaps below are almost all *layers that
were never added*, not things that were done wrong.

---

## 0. The headline

Your Google Search Console says **1 page indexed, 9 not indexed**. That is not a
content problem, a keyword problem, or a backlink problem.

I fetched a live product page the way a crawler does — no JavaScript:

```
GET https://www.shopmasterpro.in/products/kundan-chandbali-earrings-6d5643
→ <title>ShopMaster Pro</title>
→ no product name, no price, no description, no JSON-LD
→ an empty <div id="root"></div>
```

**Every product page on the site serves the same empty shell.** All the SEO work
in `frontend/src/components/common/Seo.jsx` — the per-page titles, canonicals,
Product structured data, shipping and return policy — is real and correct, but it
only exists *after React runs in a browser*. The first thing Googlebot receives
is a blank page with the title "ShopMaster Pro".

Google *can* render JavaScript, but rendering is a second, deferred,
lower-priority pass. For a new domain with no authority, the usual outcome is
exactly what your GSC shows: **"Crawled – currently not indexed" × 7**.

Everything else in this document is secondary to that.

---

## 1. What the big platforms actually do, and which problem each pattern solves

### Flipkart

| Layer | What they use | The problem it solves |
|---|---|---|
| Rendering | **Next.js SSR** for first paint, CSR after hydration | Crawler and first-time visitor both get real HTML immediately; filtering/sorting stays instant client-side |
| Backend | **Microservices** (Java / Spring Boot) — inventory, payments, search, recommendations deploy independently | One team can ship pricing without redeploying checkout; a recommendation outage does not take down cart |
| Messaging | **Apache Kafka** event streaming | Order-placed fans out to inventory, invoicing, notifications, analytics *without* the checkout request waiting for any of them |
| Infra | **Docker + Kubernetes** | Scale search 20× on Big Billion Days without scaling the seller dashboard |

The rendering split is the important one for you: **SSR for content that must be
found, CSR for interaction that must feel fast.** They did not pick one.

### Amazon-class SEO practice (2026)

| Practice | Why |
|---|---|
| Product structured data with name, image, price, currency, availability, brand, SKU | Qualifies the page for merchant/rich results |
| Facet URLs: **path segments for demand, query params for the rest** | `/shop?category=rings&color=gold&price=…` explodes into near-duplicate URLs and burns crawl budget. Only facets with genuine search demand get their own indexable URL |
| Canonical from filtered → unfiltered category page | Filtered views are hints, not new pages |
| `noindex` for low-value filter combinations | 3–4 stacked filters almost never have search demand |

### Architectural patterns (AWS / event-driven, CQRS)

- **CQRS** — separate the write model from the read model. Writes stay
  transactional and correct; reads are shaped and denormalised for speed.
- **Event sourcing** — an append-only log of what happened, so any read model can
  be rebuilt.
- **Event router** — services know the router, not each other, so one failure
  does not cascade.

**Honest assessment: you do not need any of section 1.3.** CQRS and Kafka solve
problems that appear at thousands of orders per minute. You have 10 orders. The
Flipkart *rendering* lesson applies to you today; the Flipkart *infrastructure*
lesson does not, and adopting it now would be the exact over-engineering you
explicitly told the AI to avoid while building this.

---

## 2. What ShopMaster Pro is today

```
Browser
  │
  ├── shopmaster-pro        Render Static Site   Vite + React 19 SPA (CSR only)
  │      www.shopmasterpro.in / shopmasterpro.in     Hostinger DNS → Render
  │
  └── shopmaster-api        Render Web Service   Express 5 (monolith)
             │
             ├── MongoDB Atlas  Cluster0 / shopmaster_pro  (11 collections)
             ├── Razorpay       payments + webhook (raw-body HMAC verified)
             ├── Shiprocket     standard courier rates + booking
             ├── Borzo          same-day hyperlocal
             ├── Cloudinary     product images
             └── SendGrid       transactional email (DKIM set up on the domain)
```

**Backend layering** — `routes → middlewares → controllers → utils → models`.
Clean, conventional, and consistent. Money logic is isolated in `utils/`
(`commission.js`, `payout.js`, `reservation.js`, `shipping.js`) rather than
smeared through controllers, which is the single best structural decision in the
codebase.

**What is genuinely well done** (worth knowing, so you do not "fix" it):

- **Commission snapshotting** — the rate is copied onto the order line at order
  time and never recalculated. Changing a seller's rate tomorrow cannot rewrite
  what they were owed yesterday.
- **`isPlatformOwned`** on the Seller model — your family jewellery shop is
  marked explicitly, not inferred from a 0% rate. A negotiated-0% partner would
  still need paying; your own shop does not. That distinction is correct and most
  people get it wrong.
- **Payout double-payment prevention** — a payout claims lines by stamping
  `payoutId` only where it is still `null`, in one conditional write. Two
  concurrent runs split the lines instead of both paying the same sale.
- **Stock reservation invariant** — `available = stock − reserved`, with
  compare-and-set on the reservation status so a hold cannot be released *and*
  consumed. Expired holds are released lazily, at the moment another checkout
  needs the units. No scheduler required.
- **Razorpay webhook raw-body ordering** — registered before `express.json()`, so
  the HMAC is computed over the original bytes. This is the #1 thing tutorials
  get wrong.
- **Shipping fallback bands** — measured against the live Shiprocket API and
  priced *above* observed worst case, with a documented reason.
- **30 test files** covering commission, payouts, reservations, tenant isolation,
  webhook verification, pricing.

This is not "AI-copied code that happens to run". Someone reasoned about
correctness here.

---

## 3. Gap 1 — Rendering / discoverability (**critical, fix first**)

### Evidence

| Signal | Value |
|---|---|
| Live product page HTML | empty shell, title `ShopMaster Pro` |
| GSC indexed | **1** |
| GSC not indexed | **9** — 7 "Crawled – currently not indexed", 2 "Page with redirect" |
| Live `sitemap.xml` | **79 URLs** |
| GSC "Discovered pages" for that sitemap | **6**, last read **1 Jan 2026** |
| Google Analytics / GTM on the site | **none — zero tags anywhere** |

### Three separate problems inside this one gap

**3a. No server-rendered HTML.** Covered above. This is the root cause.

**3b. The sitemap Google has is eight months stale.** Google last read the
sitemap when it had 6 URLs. The deployed file now has 79. Google has never seen
73 of your pages listed. Also, `generateSitemap.js` writes into
`frontend/public/sitemap.xml`, which means **the sitemap is only as fresh as the
last frontend build** — add a product today and the sitemap does not change until
you rebuild and redeploy.

**3c. Self-inflicted redirect.** The sitemap lists `https://www.shopmasterpro.in/`,
but `App.jsx` has `<Route path="/" element={<Navigate to="/shop" />} />`. You are
submitting a URL that immediately redirects. That is 1 of your 2 "Page with
redirect" entries; the other is almost certainly the apex → www redirect.

### The fix ladder — cheapest first

| Option | Effort | Result |
|---|---|---|
| **A. Prerender at build time** (`vite-react-ssg` or similar) | ~half a day | Real HTML for `/shop`, category pages and every product page. Solves 90% of this with zero runtime cost. Note: `prerender-spa-plugin` and `Rendertron` are archived — do not use them |
| **B. Serve the sitemap from the API** (`GET /sitemap.xml` on shopmaster-api, generated from live data, `Cache-Control: 1h`), and point `robots.txt` at it | ~1 hour | Sitemap is never stale again. Drop the build-time file |
| **C. Remove `/` from the sitemap**, or make `/` render the shop directly instead of redirecting | 10 minutes | Kills the redirect warnings |
| **D. Resubmit the sitemap in GSC + "Request indexing"** on 3–4 product URLs | 15 minutes | Forces a re-crawl instead of waiting |
| **E. Full SSR (Next.js migration)** | weeks | Only worth it if the catalogue grows a lot and you want per-request personalisation. **Not now** |

Do **A + B + C + D**. Skip E.

### One more honest point

A brand-new `.in` domain with ~50 seeded products, no About page, no Contact
page, no returns policy page and no inbound links is *also* a weak candidate for
indexing on non-technical grounds. Google's "Crawled – currently not indexed"
frequently means "we saw it, we do not think it is worth storing yet." Fixing the
HTML is necessary but not sufficient — see Gap 3.

---

## 4. Gap 2 — Analytics (**you are flying blind**)

There is **no GA4, no GTM, no analytics tag of any kind** in `index.html` or
anywhere in `frontend/src`. The only "analytics" in this project is your own
admin dashboard reading your own database.

That means you currently cannot answer:

- How many people visit, from where, on what device
- Where they drop out of the checkout funnel
- Which product pages get traffic and which convert
- Whether the 10 clicks GSC recorded turned into anything

`AdminDashboard.jsx` shows *orders*. It cannot show *sessions that did not
become orders* — which is the number that actually tells you what to fix.

**Fix:** add GA4 with e-commerce events (`view_item`, `add_to_cart`,
`begin_checkout`, `purchase`), and link GA4 to Search Console so query data and
behaviour data sit in one place. Roughly two hours of work, and it is the
prerequisite for every marketing decision you make afterwards.

---

## 5. Gap 3 — Business logic gaps found by reading the code

These are the ones only a full-codebase read surfaces. Ranked by money at risk.

### 5.1 The return window is not enforced — **this one loses real money**

`utils/payout.js` is built entirely around a 7-day return window:

```js
const RETURN_WINDOW_DAYS = 7;   // "matches the 7 days promised to customers"
```

A seller is paid once delivery is older than 7 days, on the stated assumption
that the return window has closed.

But `customerController.returnOrder` (line ~594) checks only this:

```js
if (order.status !== "delivered") { ...reject... }
order.status = 'returned';
// full refund issued
```

**There is no date check at all.** A customer can return an order delivered six
months ago and receive a full refund.

The failure case:

```
day  0   delivered
day  8   payout runs → seller paid their sellerEarning
day 30   customer returns → platform refunds the customer 100%
         → seller keeps the money, no clawback code exists anywhere
         → the platform absorbs the entire loss
```

Returns *inside* 7 days are handled correctly — `status` becomes `'returned'`,
which drops the order out of `payableOrderFilter()`, so the seller is never paid.
The whole design is sound. It is one missing guard.

**Fix:** in `returnOrder`, reject when
`order.deliveredAt < Date.now() − RETURN_WINDOW_DAYS × 86400000`, importing the
constant from `utils/payout.js` so the two can never drift apart.

### 5.2 Structured data promises a shipping price you do not charge

`Seo.jsx`:

```js
const POLICY = {
  shippingRate: 100,   // "flat freight quoted at checkout, INR"
  ...
};
```

But `utils/shipping.js` quotes live Shiprocket rates, and when the API is down
falls back to weight bands of **₹80 – ₹845**. There is no flat ₹100 anywhere in
the checkout.

So every product page tells Google "delivery ₹100" while the customer is charged
something else — usually more. That is a merchant-listing mismatch (Google can
demote the rich result), and more importantly it is a public promise the checkout
does not keep.

**Fix:** either compute the JSON-LD shipping value from the same weight bands
`shipping.js` uses, or declare a shipping range rather than a single figure.
`returnDays: 7` is correct and matches `RETURN_WINDOW_DAYS` — leave that alone.

### 5.3 Returns refund `totalAmount`, which includes shipping

`returnOrder` refunds `order.totalAmount` — item value **plus** the freight you
already paid the courier. Combined with `returnFees: FreeReturn` in the JSON-LD,
you are absorbing outbound shipping, return shipping, and the item.

That may be a deliberate customer-friendliness choice. But it should be a
decision you made, not one the code made for you.

### 5.4 No trust pages exist

There is no About, Contact, Privacy, Terms, Shipping Policy or Returns Policy
route in `App.jsx`. For an Indian e-commerce site this matters three ways:

1. **SEO/E-E-A-T** — Google is measurably reluctant to rank a transactional site
   with no identity or policy pages.
2. **Consistency** — your structured data publicly promises a 7-day free-return
   policy that no page on the site states.
3. **Payments** — Razorpay's merchant terms expect published refund, shipping,
   privacy and contact pages.

Six small static routes. Cheap, and they also give the sitemap non-product URLs
worth indexing.

### 5.5 Category URLs are query parameters

Your category pages are `/shop?category=rings`. Every research source above says
the same thing: facets with genuine search demand should be **path segments**
(`/shop/rings`), because query-parameter URLs are treated as filtered views of
one page and are weak indexing candidates.

You have ~40 category URLs in the sitemap, all of them query-parameter form. On
current evidence none are indexed.

**Fix:** add `/shop/:categorySlug` as a real route, canonical to it, and keep
`?category=` working as a redirect. Do this *after* prerendering — prerendered
path-segment category pages are exactly the kind of page that ranks for
"kundan earrings online" style queries.

---

## 6. Gap 4 — Production hardening (not urgent, but real)

Absent from `backend/` entirely:

| Missing | Consequence |
|---|---|
| `helmet` | No security headers (HSTS, X-Frame-Options, CSP) |
| Rate limiting | Login, OTP resend and checkout can be hammered. `otpLastSentAt` throttles OTP email specifically — good — but nothing throttles login attempts |
| `compression` | JSON responses ship uncompressed |
| Structured logging (`pino`/`winston`) | Production debugging is `console.log` in Render's log tail |
| Error monitoring (Sentry) | You find out something broke when a customer tells you |
| Health check endpoint | Render cannot distinguish "process alive" from "database reachable" |

`helmet` + `express-rate-limit` is about 20 lines and an hour's work. The rest can
wait for real traffic.

---

## 7. What I would actually do, in order

| # | Task | Effort | Why this order |
|---|---|---|---|
| 1 | Prerender `/shop`, categories and product pages at build time | half a day | Nothing else about SEO matters until crawlers get HTML |
| 2 | Serve `/sitemap.xml` live from the API; drop `/` from it | 1–2 hours | Sitemap stops going stale the moment you add a product |
| 3 | Resubmit sitemap + request indexing on a few products in GSC | 15 min | Forces the re-crawl |
| 4 | **Enforce the 7-day return window in `returnOrder`** | 30 min | The only outright money leak found |
| 5 | Add GA4 + e-commerce events, link to GSC | 2 hours | You cannot improve what you cannot see |
| 6 | Add About / Contact / Privacy / Terms / Shipping / Returns pages | half a day | Trust signals, Razorpay compliance, backs the JSON-LD promise |
| 7 | Fix the JSON-LD shipping figure to match real rates | 1 hour | Stop publishing a price you do not charge |
| 8 | `helmet` + rate limiting on auth routes | 1 hour | Cheap hardening |
| 9 | `/shop/:categorySlug` path-segment category routes | half a day | Real ranking upside, but only after #1 |
| 10 | Sentry + structured logging | 2 hours | When traffic justifies it |

**Explicitly not recommended:** microservices, Kafka, CQRS, event sourcing,
Redis, a Next.js rewrite. Every one of those solves a scale problem you do not
have, and adopting them would undo the "one developer, simple, no unnecessary
code" principle this project was built on — which was the right principle and
still is.

---

## Sources

- [Dissecting the Tech Stack of E-commerce Giant "Flipkart"](https://medium.com/@alammobashshir/dissecting-the-tech-stack-of-e-commerce-giant-flipkart-30c930866e68)
- [Navigating the Rendering Landscape: Netflix, Flipkart, Airbnb, Facebook](https://medium.com/@pradeeptiwari.bhumca10/navigating-the-rendering-landscape-a-deep-dive-into-netflix-flipkart-airbnb-and-facebooks-ae0e6a87caa2)
- [Flipkart's Cloud Architecture: Scaling for Millions of Shoppers](https://www.bunksallowed.com/2025/10/flipkarts-cloud-architecture-scaling.html)
- [Amazon & Flipkart E-Commerce Design Guide 2025](https://getsdeready.com/amazon-flipkart-e-commerce-design-guide-2025/)
- [Ecommerce Product-Page SEO 2026 Optimization Guide](https://www.digitalapplied.com/blog/ecommerce-product-page-seo-2026-optimization-playbook)
- [Faceted Navigation SEO: 6 Patterns Big Stores Use in 2026](https://www.get-ryze.ai/blog/faceted-navigation-seo-6-patterns-big-stores-use-in-2026)
- [Faceted Navigation SEO: Index, Noindex or Canonical Guide](https://www.get-ryze.ai/blog/faceted-navigation-seo-for-ecommerce-index-noindex-or-canonical)
- [Render Modes (SPA, SSR, SSG, HTML-only) — vite-plugin-ssr](https://vite-plugin-ssr.com/render-modes)
- [Why Vite + React is the best fit for React developers (SSG/SSR)](https://www.vintasoftware.com/blog/vite-react-ssg-ssr)
- [Why SPAs still struggle with SEO, and what developers can do](https://dev.to/arkhan/why-spas-still-struggle-with-seo-and-what-developers-can-actually-do-in-2025-237b)
- [CQRS — Event-driven Architecture on AWS](https://aws-samples.github.io/eda-on-aws/patterns/cqrs/)
- [Event-Driven Architecture — AWS](https://aws.amazon.com/event-driven-architecture/)
