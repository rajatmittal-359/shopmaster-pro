# What is left — code work

The one list. Decided-and-unfinished work lives here and nowhere else; the
reasons behind each item live in `FRONTEND-PLAN.md` (section numbers given) or
`OPS-AND-MANUAL-ACTIONS.md`. Rajat's own manual tasks are **not** here — they
are the list at the top of the OPS document.

Built so far: `web/` is complete for the October cutover (43 pages, every React
route mapped, plus everything the React app never had — see plan §13). What
follows is what remains after that.

**Last swept: 12 September 2026.**

---

## 1. Dropped in the port — the React app had these, `web/` does not

**`frontend/` is not deleted until this section is empty.** Rajat, 12 Sep: the
Next app shows things *our* way and adds what React never had, but React is
the record of what the shop could *do* — anything here still has to come
across, in the new UI, not the old one.

Found on 12 Sep by two diffs: every API path the React app calls against every
path `web/` calls, then a feature-word pass over the customer pages. Route
mapping alone had missed all of these. **1.2 dispute, 1.3 item cancel and 1.5
cancellation reason were built on 12 Sep (plan §4.20); 1.1 review writing on
12 Sep (plan §4.21) — which also closed 2.1: every review is verified by
construction, the label was already honest; 1.4 video on 12 Sep (plan §4.22).**

**Empty and verified, 12 Sep 2026** — review form (as customer Abha) and video
upload + playback (as seller Charming Jewels) both checked in the local browser
with the test accounts (plan §4.23).

Checked and **present** in `web/` (no action): wishlist, addresses, coupons,
COD and Razorpay, the address-specific delivery speeds (same-day when Borzo
will take it), pincode check, the bill of supply, confirm-receipt, return and
exchange requests, seller payout details, seller earnings, every admin action
(approve / reject / suspend / activate / commission / disputes / payouts /
categories / coupons).

Not carried across on purpose: `GET /public/products/categories/all`,
`PATCH /seller/orders/:id/tracking`, `GET /seller/profile`, `GET /reviews/me` as
a page — the React app defined these in its services and no screen used them.

## 2. Decided, not finished

| # | What | Decided where | Blocked on |
|---|---|---|---|
| 2.6 | **14 seeded products still share the old description** (was 35; 21 done 12 Sep). Next day with quota: `node draftProductDescriptions.js` then `--apply` (apply now reads the file, no second Gemini pass). None reach the feed | OPS backlog | Gemini daily quota |
| 2.9 | **Sentry** — the one blind spot: a 500 at checkout is invisible | Plan §7b | Rajat's DSN |
| 2.12 | ~~`seedMessy.js`~~ ✅ 13 Sep — 12 ugly cases added to the dev DB (NDR ×2 attempts, NPR, open dispute with POD, resolved dispute + refund, seller cancel with ₹50 penalty, return in transit, replacement due, 3 coupons incl. expired, payout with deduction, suspended partner seller, 0-stock + photo-less product, Leh address). **First catch: a suspended seller's products stayed on the storefront** → `utils/hiddenSellers.js`, applied to list/suggest/product page/feed/sitemap. Next: walk every page with these states (customer, seller, admin) and fix what draws wrong | this list | — |

## 2b. Google visibility — the full list, decided 12 Sep 2026

Rajat: *"Google pe product har factor me win kare… sab chahiye jo free me
available ho; manual jo bologe kar lunga."* Goal: liquidity (product pages
found and clicked) and trust (reviews, honest listing data). Today's truth
from Search Console: 90 days, 7 queries, all the brand name misspelt, no
product word; 2 pages indexed, 8 not.

| # | What | Free? | Rajat does | Claude builds | State |
|---|---|---|---|---|---|
| G1 | Search Console API — what people typed, per page, position (GA4 ↔ Search Console linked 13 Sep too) | ✅ | done (service account is a user) | admin card ✅; seller: per-product queries in the listing panel | ✅ both |
| G2 | URL Inspection API — is each product page indexed, last crawl | ✅ same account | — | "Google indexed: yes/no" per product ✅; admin list `/admin/google` ✅ (52 checked 12 Sep: 0 indexed — the new URLs are not live until cutover, the page says so) | ✅ both |
| G3 | Merchant Center API — per-product approved / disapproved + reason. **Migrated to Merchant API (products v1) 13 Sep** — Content API sunset 18 Aug 2026 | ✅ verified (18 approved) | ✅ done 13 Sep — registerGcp + API-developer user; 18 approved read live through products v1 | seller sees Google's verdict on the product ✅; admin sees all on `/admin/google` ✅ (17 approved, 35 not in the feed — other sellers' products; feed is Charming Jewels only, by design) | ✅ both |
| G4 | Product structured data for merchant listings — `OfferShippingDetails` (₹100, 1–2 + 3–7 days, IN), `MerchantReturnPolicy` (7 days, customer pays courier), `aggregateRating` only where reviews exist, seller = the shop | ✅ code | — | `web/src/lib/productSchema.js`, verified on a local product page 12 Sep | ✅ |
| G5 | Listing quality panel — score, checklist (title/photos/colour/size/description), AI keywords, Google preview, G1–G3 data inline | ✅ (Gemini/nano) | — | product form | ✅ 12 Sep (plan §4.30) |
| G6 | GA4 property + Data API — traffic, product views, add-to-cart funnel | ✅ | **create GA4 property → send Measurement ID (G-…) + Property ID; add the service account as Viewer; enable Analytics Data API** | ✅ built 13 Sep: gtag via `next/script`, page_view per route, `view_item / add_to_cart / begin_checkout / purchase / search`; `/admin/google/traffic` + Visitors card (sessions, funnel, top pages). Silent until `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `GA4_PROPERTY_ID` are set | ✅ 13 Sep — tag live (`G-SK8WB9BKFG`), Data API answering (property 553869046, SA Viewer). Numbers fill in over the week |
| G7 | PageSpeed Insights API — Core Web Vitals per page | ✅ | done 13 Sep (key restricted to PageSpeed) | ✅ Speed card live on `/admin/google`. **First truth, live React site on mobile: Home 73 / LCP 5.1 s poor · Shop 71 / 5.9 s · product 70 / 8.3 s — all LCP poor, CLS 0.12.** This is G10's argument in numbers; re-measure the Next app the day it goes live and fix what it still shows | ✅ |
| G8 | Google Business Profile — reviews, products, posts (local pack, "near me") | ✅ | **reviews 2→30, add products, one post a week** (Mummy, from `rajatmittal6908`); **send Instagram / Justdial / GBP Maps links** | ✅ 13 Sep: `sameAs` = Instagram, Justdial, GBP knowledge-graph link, on the Organization schema | ✅ (GBP filling = Mummy, from the list in OPS) |
| G9 | Merchant promotions — coupons shown in Shopping results | ✅ | add-on ✅; **paste the feed URL** in Merchant Center → Add promotions → from a file | ✅ 13 Sep: `/api/feed/promotions.txt` (TSV per Google's spec; live, unexhausted, platform + fed-seller coupons; IST dates; ₹ money_off / percent_off) — `utils/promotionsFeed.js` | ✅ (URL → Rajat) |
| G11 | **Google Customer Reviews** (Merchant Center programme) — after each order a one-question Google survey; enough answers earn the **seller-rating stars** under our name in Shopping and Search. Free; Flipkart/Myntra carry them | ✅ | **Merchant Center → https://merchants.google.com/mc/programs?a=5849184820 → Customer Reviews → Enable → accept terms**, then say so | ✅ built 13 Sep: checkout lands on `/orders?placed=<id>` → "Order placed" band (order number, arriving-by) + Google's opt-in module (`OrderPlaced.jsx`, fields per answer/14629205). Programme enabled + env set 13 Sep. Google verifies the opt-in on the first real orders after cutover (needs the confirmation page on the live domain). **Badge** (`merchantwidget.js`, footer) deliberately not added yet — it reads "no rating available" until surveys come back; add at ~10 ratings | ✅ (verifies itself after cutover) |
| G12 | **Postmaster Tools** — Google's own view of whether our order emails land in Gmail inboxes or spam | ✅ | done 13 Sep (verified via the existing Search Console TXT) | — | ✅ ("Not enough data" until real volume) |
| G13 | **Google Alerts** — "ShopMaster Pro", "shopmasterpro.in", "Charming Jewels" Jaipur, daily to rajatmittal359 | ✅ | done 13 Sep | — | ✅ |
| G14 | **Google for every seller, not just Charming Jewels.** On a marketplace the seller does NOT set Google up - the platform does it once (Amazon/Flipkart/Meesho: the seller only writes the listing). Google's structure for this (support.google.com/merchants/answer/14228975): a **Marketplace multi-client account** with a *marketplace-owned* sub-account (Charming Jewels, today's) and a *multi-seller* sub-account carrying every other seller's products with `external_seller_id` (answer/11537846). Apply when the first real third-party seller joins; until then `FEED_ALL_SELLERS=false` is right | ✅ | Merchant Center → apply for marketplace account (Google reviews it); rename to ShopMaster Pro | feed: `external_seller_id` + seller name per item; a seller-panel page "How your products reach Google" (what we do for them, the 5 things only they can do: GBP for their shop, reviews, photos, honest titles, stock) | ☐ at first third-party seller |
| G15 | **Merchant API Reports** — per-product Shopping impressions/clicks (`product_performance_view`) | ✅ | — | ✅ 13 Sep: seller Listing panel "shown 340× in Shopping, 4 clicks (28 days)", admin Google table column. Google's product-level rows are empty so far (only non-product clicks: 4) — fills in as impressions accrue | ✅ |
| G16 | **Places Autocomplete (New)** on the checkout address — wrong addresses are the NDR/RTO the rulebook charges for; Amazon/Flipkart both autocomplete | 10k req/month | enable Places API (New) + website-restricted key; **needs a Cloud billing account even for the free tier - his card was refused before; if refused again, fall back to India Post pincode lookup + a better form** | suggestions + pincode/city/state fill | ☐ |
| G17 | **Google One Tap** sign-in — one tap at the login wall, same OAuth client | ✅ | — | ✅ 13 Sep: `GoogleOneTap.jsx` on storefront routes for signed-out visitors (quiet on login/register/checkout and in the panels); GSI initialised once in `lib/googleSignIn.js`, shared with the login button. Verify visually signed-out on the live domain after cutover (Google gates One Tap on the origin) | ✅ |
| G18 | **reCAPTCHA v3** on register / login / coupon apply — bots arrive with real coupons | 10k/month | enable + site key, at launch | middleware + score threshold | ☐ launch |
| G10 | Cutover — the React app is why 8 pages are not indexed (client-rendered); Next renders them | — | October, Render card | already built | ☐ Oct |
| — | Keyword Planner / Trends volume | needs Ads account + approval | not now | — | dropped |

**First-run tour**: seller and admin ✅ (12 Sep). Customer storefront: none on purpose - Amazon and Flipkart show no tour to shoppers.

**Our own site search**: Atlas Search ✅ 12 Sep — index `products_search`
(created from the app's connection), typo/prefix tolerant, name over tags over
description, relevance order, regex fallback if Search is ever unavailable.
Live: jhumki → Pearl Drop Jhumka, kundn choker → Kundan Choker Set. Later:
synonyms collection (jhumka/jhumki/झुमका), Gemini query → filters.

## 3. Rajat's call — researched, waiting on a decision

- **Seller performance / RTO rate page.** The first piece exists (cancel rate on the dashboard and the admin list, plan §4.26); late-dispatch and RTO counts would join it the same way. Now, or at thirty sellers? (Plan §14.2)
- **Buyer-protection line on the product page.** Needs the copy — what we actually promise. (Plan §13)
- **Buyer–seller messaging.** Large. Later. (Plan §13)
- **Return label generation** — dropped as a need: in India the reverse-pickup rider brings the label (Amazon, Flipkart, Delhivery); the customer's page now says so. Revisit only if a courier asks the customer to print.
- **Request-validation layer** (Zod/Joi) — controllers validate by hand today; add when a second pair of hands starts writing endpoints.
- **Direct-to-Cloudinary uploads** once 7 MB video clips stop being enough — needs an unsigned upload preset in the Cloudinary console. (OPS backlog)

## 4. Ideas raised, not decided — do not start without a yes

- Google Cloud extras (Always-Free page read 13 Sep: docs.cloud.google.com/free/docs/free-cloud-features), each gated on a real need appearing: **Web Risk** (100k URI checks/month) to screen links sellers paste (website, video) once unknown sellers join · **Cloud Run** (2M req/month) as the hosting fallback if Render's paid tier bites after cutover · Vision SafeSearch to auto-moderate seller photos (1k/month free) when unknown sellers join · Speech-to-Text (60 min/month) or Groq Whisper for voice listing · Sheets API order export for the CA · Web push (FCM) for "shipped" · Google Wallet loyalty pass · photo-to-search via Gemini vision + Atlas Search.
- Search by embeddings (Atlas Search now covers typos/prefix; embeddings only if semantic misses show up).
- Voice input for the AI listing (Groq or Cloudflare Whisper).
- Text fallback when Gemini's quota is out — Pollinations serves free text models (`gpt-5.4-nano`, `deepseek-v4-flash-vision`, `glm-5.3-flash`).
- Real 3D product views (Tripo3D) — "3D later" was Rajat's phrase.
- The `/sell` recruitment page rebuilt with `taste-skill`'s dials against `web/DESIGN.md`; a brand board from `brandkit`.
- Re-run the logged-out marketplace navigation research that a session limit cut off (plan §15).

## 5. After cutover only

- Delete `frontend/` a week after the domain moves (plan §13a, OPS cutover list).
- Key rotation, test-data deletion, branding polish — the deferred cleanup.
- Old Studio results made before `AiDraft` existed are not in the drafts strip; nothing to do unless he misses one.

---

*When something here is finished, delete the row and add a line to plan §13 or
the OPS changelog. When something new is decided, add it here the same day.*
