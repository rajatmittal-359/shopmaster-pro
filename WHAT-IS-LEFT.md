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
| 2.9 | ~~**Sentry**~~ ✅ 13 Sep — org `shopmaster-pro`, project `shopmaster-backend`, `utils/monitoring.js`; captures 5xx from `sendError`, the error middleware and cron jobs; bodies/headers stripped. Test error received. **Left: `SENTRY_DSN` on Render** (OPS list) · Next `web/` project at cutover | Plan §7b | Render env var |
| 2.12 | ~~`seedMessy.js`~~ ✅ 13 Sep — 12 ugly cases added to the dev DB (NDR ×2 attempts, NPR, open dispute with POD, resolved dispute + refund, seller cancel with ₹50 penalty, return in transit, replacement due, 3 coupons incl. expired, payout with deduction, suspended partner seller, 0-stock + photo-less product, Leh address). **First catch: a suspended seller's products stayed on the storefront** → `utils/hiddenSellers.js`, applied to list/suggest/product page/feed/sitemap. Walked 13 Sep: **seller** dashboard/orders/payments (3 fixes: bank flag, payout deduction line, GST) · **admin** orders (dispute with POD draws right) · **customer** order page (2 fixes: passed ETA now reads *Running late*; replacement `due` no longer claims *on its way*). Still to eyeball in the browser: seller Orders tabs with NDR/NPR/penalty rows, customer order pages as Abha/Priya | this list | — |

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
| G9 | Merchant promotions — coupons shown in Shopping results | ✅ | done 13 Sep — source `PROMOTIONS SOURCE 1` on the feed URL, daily 12 AM | ✅ `/api/feed/promotions.txt`; Google accepted 2 promotions 03:21 ("No issues found"); review takes 1–2 days. Lesson kept in the code: dates from the coupon, start date in the id | ✅ |
| G11 | **Google Customer Reviews** (Merchant Center programme) — after each order a one-question Google survey; enough answers earn the **seller-rating stars** under our name in Shopping and Search. Free; Flipkart/Myntra carry them | ✅ | **Merchant Center → https://merchants.google.com/mc/programs?a=5849184820 → Customer Reviews → Enable → accept terms**, then say so | ✅ built 13 Sep: checkout lands on `/orders?placed=<id>` → "Order placed" band (order number, arriving-by) + Google's opt-in module (`OrderPlaced.jsx`, fields per answer/14629205). Programme enabled + env set 13 Sep. Google verifies the opt-in on the first real orders after cutover (needs the confirmation page on the live domain). **Badge** (`merchantwidget.js`, footer) deliberately not added yet — it reads "no rating available" until surveys come back; add at ~10 ratings | ✅ (verifies itself after cutover) |
| G12 | **Postmaster Tools** — Google's own view of whether our order emails land in Gmail inboxes or spam | ✅ | done 13 Sep (verified via the existing Search Console TXT) | — | ✅ ("Not enough data" until real volume) |
| G13 | **Google Alerts** — "ShopMaster Pro", "shopmasterpro.in", "Charming Jewels" Jaipur, daily to rajatmittal359 | ✅ | done 13 Sep | — | ✅ |
| G14 | **Google for every seller, not just Charming Jewels.** On a marketplace the seller does NOT set Google up - the platform does it once (Amazon/Flipkart/Meesho: the seller only writes the listing). Google's structure for this (support.google.com/merchants/answer/14228975): a **Marketplace multi-client account** with a *marketplace-owned* sub-account (Charming Jewels, today's) and a *multi-seller* sub-account carrying every other seller's products with `external_seller_id` (answer/11537846). Apply when the first real third-party seller joins; until then `FEED_ALL_SELLERS=false` is right | ✅ | Merchant Center → apply for marketplace account (Google reviews it); rename to ShopMaster Pro | feed: `external_seller_id` + seller name per item; a seller-panel page "How your products reach Google" (what we do for them, the 5 things only they can do: GBP for their shop, reviews, photos, honest titles, stock) | ☐ at first third-party seller |
| G15 | **Merchant API Reports** — per-product Shopping impressions/clicks (`product_performance_view`) | ✅ | — | ✅ 13 Sep: seller Listing panel "shown 340× in Shopping, 4 clicks (28 days)", admin Google table column. Google's product-level rows are empty so far (only non-product clicks: 4) — fills in as impressions accrue | ✅ |
| G16 | **Places Autocomplete (New)** on the checkout address — wrong addresses are the NDR/RTO the rulebook charges for; Amazon/Flipkart both autocomplete | 10k req/month | enable Places API (New) + website-restricted key; **needs a Cloud billing account even for the free tier - his card was refused before; if refused again, fall back to India Post pincode lookup + a better form** | suggestions + pincode/city/state fill | ☐ |
| G17 | **Google One Tap** sign-in — one tap at the login wall, same OAuth client | ✅ | — | ✅ 13 Sep: `GoogleOneTap.jsx` on storefront routes for signed-out visitors (quiet on login/register/checkout and in the panels); GSI initialised once in `lib/googleSignIn.js`, shared with the login button. Verify visually signed-out on the live domain after cutover (Google gates One Tap on the origin) | ✅ |
| G18 | **reCAPTCHA v3** on register / login / coupon apply — bots arrive with real coupons | 10k/month | enable + site key, at launch | middleware + score threshold | ☐ launch |
| G19 | **YouTube link as product video** — seller pastes a link (watch / youtu.be / Shorts), we embed; no upload, no 7 MB limit, no key (thumbnail from i.ytimg, nocookie player) | ✅ | — | ✅ 13 Sep: `utils/youtube.js` + `lib/youtube.js`, VideoSlot "or paste a YouTube link", Gallery iframe, schema `VideoObject` (embedUrl/thumbnail) for every video incl. uploads. Verified via API (set / reject vimeo / remove) | ✅ |
| G20 | **Map on Contact** — Google's keyless embed (no key, no billing, no quota) + "Get directions" | ✅ | — | ✅ 13 Sep, pin lands on Charming Jewels. Seller shop pages: only when a seller opts in to show location (a pickup address can be a home) — later | ✅ |
| G21 | **Get found on Google - per-seller workspace** (Rajat 13 Sep: a second seller must not redo Charming Jewels' twelve tabs by hand) | ✅ | — | ✅ 13 Sep — `/seller/grow`, measured ten-step checklist, GBP guide, review message, Settings → Your shop on the web, shop page `sameAs` schema (plan §4.35). Later: per-seller Merchant status once the marketplace account exists (G14) | ✅ |
| G10 | Cutover — the React app is why 8 pages are not indexed (client-rendered); Next renders them | — | October, Render card | already built | ☐ Oct |
| — | Keyword Planner / Trends volume | needs Ads account + approval | not now | — | dropped |

**First-run tour**: seller and admin ✅ (12 Sep). Customer storefront: none on purpose - Amazon and Flipkart show no tour to shoppers.

**Our own site search**: Atlas Search ✅ 12 Sep — index `products_search`
(created from the app's connection), typo/prefix tolerant, name over tags over
description, relevance order, regex fallback if Search is ever unavailable.
Live: jhumki → Pearl Drop Jhumka, kundn choker → Kundan Choker Set. Later:
synonyms collection (jhumka/jhumki/झुमका), Gemini query → filters.

| 2.15 | **Cutover code**: `next.config` 301 map from the React app's indexed URLs to the Next ones; `migrateToProd.js` per the OPS "Production data" plan | OPS cutover plan | at cutover |
| 2.16 | **Settings, the rest of the consumers**: policy pages, Bill, seller Help still read the code's BUSINESS defaults (server pages can take `businessFrom(await getSettings())` like Footer/Contact/Help/home do); `sameDayEnabled` and `freeShippingAbove` are stored but not yet enforced in `utils/shipping.js` | plan §4.37 | — |
| 2.18 | ~~**Voice**~~ ✅ 13 Sep — mic in Ask ShopMaster + search bar + product form ("bol ke listing": numbers via fast model + regex, words via draftListing), auto-stop on silence, हिंदी/Hinglish/English chip drives script and voice, answers read aloud. Phone-verified. Left: Mummy's real voice test; https on cutover removes the Chrome-flag step | §3b A1–A2 | — |
| 2.19 | **Admin decision agent** — ✅ 13 Sep for disputes: `utils/ai/decisionAgent` (facts first, Gemini → Groq gpt-oss-120b → nano), "Draft a brief" on /admin/orders with recommendation + confidence + "Use this note"; verified on the live dispute (POD present → seller, 92%). Left: the seller-application brief on /admin/sellers | §3b agents | — |
| 2.20 | ~~**Market insights**~~ ✅ 13 Sep code: `utils/google/marketInsights` (both reports, 6-h cache, `{enabled:false}` until Google switches it on), seller Grow card "What the market is doing", `GET /admin/google/market`. Shows "comes with traffic" today; fills itself after cutover. Left: a card on /admin/google when data exists | §3b C | — |
| 2.21 | ~~**Similar products + Hinglish search**~~ ✅ 13 Sep — `utils/searchSynonyms` (jhumka⇄earrings⇄झुमका, lal→red, ladki→women…) widens every search and suggestion; `utils/productVectors` + `npm run vectors:products` (53 products embedded, Atlas `products_vec` - the third and last free slot) gives semantic top-up when text finds < 6 and `GET /public/products/:id/similar`; "You may also like" rail on the product page. Left: run `vectors:products` after catalogue changes (weekly job with 2.17) | §3b A4 | — |
| 2.22 | **Trust queue** — Groq `gpt-oss-safeguard-20b` with our policy over reviews, dispute text, seller About/links, coupon names + listing-photo safety/counterfeit check (Gemini) → one admin "Review queue", auto-hold on hit | §3b A3 + D, decided 13 Sep | — |
| 2.23 | **Assistant evals + AI Gateway** — ✅ 13 Sep first cut: `npm run eval:assistant` (9 cases × 3 roles × 3 languages, graded by code: script, filler, length, next step, must-have numbers; 8/9 clean with Gemini out and Groq at its minute limit). Left: judge-model rubric, nightly run, trend on /admin/ask; Cloudflare AI Gateway (cost/cache/logs) | §3b E, decided 13 Sep | Rajat: create AI Gateway in Cloudflare dashboard (1 min, link when we get there) |
| 2.24 | **Assistant gaps** — suspended seller may still ask (limited tools); tools `myPayments`, `checkCoupon`, `disputeBrief`, `customerRisk`; payouts-vs-Razorpay-settlement reconciliation line in the digest | §3b, decided 13 Sep | — |
| 2.25 | **Agents, small** — seller growth note (weekly Hindi "3 kaam" email from Grow), catalogue agent (nightly: fix drafts, duplicates, alt text) · **MCP server** exposing the assistant's tools · NVIDIA NIM reranker + third text fallback | §3b, decided 13 Sep | — |
| 2.26 | **Push notifications for sellers** — "naya order", "return aaya", "dispute: 72 ghante" on the phone (Web Push/VAPID, free, Android + iPhone, no app store); "Turn on notifications" button on seller Home/Orders; email stays as the copy | 13 Sep research (non-AI) | — |
| 2.27 | **Hindi audio lessons** — the five Learn lessons as pre-generated audio ("सुन लो" button) for the shopkeeper who would rather listen; browser TTS first, ElevenLabs free tier (10k chars/month) for a better voice once | 13 Sep research | Rajat: ElevenLabs signup only if browser voice sounds bad |
| 2.28 | **Free Google tools surfaced where the seller/admin works** — Merchant Center **Product Studio** (free product-scene images) linked from Photo studio; GA4 "Ask insights" + Search Console Insights linked from /admin/google; GBP review-reply AI noted in the GBP guide; **Cloudflare Turnstile** on signup/apply (free bot check, no puzzle for humans) | 13 Sep research | — |
| 2.29 | **Fair Returns** — ✅ 13 Sep part 1: modes R/X/N (category default + seller pick in the product form, shown on the product page), customer return request with kind + photos + tag confirm (server-enforced), seller pack proof + receipt check + dispute response with photos, admin return approval, customer risk record + level (prepaid-only refuses COD), six rulebook numbers in settings, assistant knows it. **Left**: Shiprocket QC-return + OTP delivery flags on booking, printable return tag + Learn lesson, return mode line at checkout and in the order email, category admin UI for allowed modes, the customer's account showing their risk reason, `kind` mandatory at cutover (old app sends none). Policy matrix in plan **§4.39** (modes R/X/N + legal always-return, claim→evidence→cost table, item-came-back-wrong rule, two risk scores, amount tiers, timelines). (Rajat 13 Sep: "ladki 2 din pehen ke wapas kar de, tod ke bole maine nahi toda… dono ka dhyan, trust banegi"). Researched: Myntra/Flipkart tamper tags ("no tag, no return"), hygiene non-returnables (earrings/innerwear) with damaged/wrong always returnable (CP E-Commerce Rules), evidence both sides, reverse-pickup QC, repeat-abuser flags. Build, with 2.19: (1) category return rule admin-set - returnable / exchange-only / hygiene non-returnable - shown on product page + checkout; (2) **Pack proof** photo before "Book courier", saved on the fulfilment; (3) printable return tag + Learn lesson; (4) return request: reason, photo mandatory for damaged/wrong within 48 h of delivery, tag-intact confirm for change-of-mind; (5) Shiprocket QC-return on reverse pickup; (6) seller receipt check OK/not-OK + photos within 48 h → admin dispute; (7) customer risk score (return %, refused returns, lost disputes, RTO) → warn → prepaid-only → returns need approval → block, reason visible to the customer; (8) every ruling written on the order, appeal via /help in 7 days, 48 h ack / 30 d resolve; (9) knowledge.js + decision agent read all of it | 13 Sep research | Rajat: order a roll of tamper-evident tags for Charming Jewels once the lesson is live |
| 2.17 | **Ask ShopMaster, next**: re-index after doc edits (`npm run knowledge`) and products (`npm run vectors:products`) - make both a weekly cron with the digest; index the customer-facing product/category copy when the catalogue is real; per-answer cost log when Gemini quota starts biting; consider a "was this right?" admin correction that writes a `KnowledgeChunk` (audience admin) so a wrong answer is fixed once | plan §4.38 | — |
| 2.13 | **Hindi, the rest of the seller panel** — foundation and the daily loop done 13 Sep (plan §4.36); left: Orders page body text, Returns & issues, Products list, Settings, Payments, Help/Grow copy, toasts. Add lines to `lib/i18n.hi.js` page by page | plan §4.36 | — |
| 2.14 | **Two accounts, fixed (Rajat 13 Sep):** `rajatmittal6908@gmail.com` = the Charming Jewels **seller**, `rajatmittal359@gmail.com` = the **admin**. Never merged. Verified in the dev DB 13 Sep: already exactly so (both Google-linked, Seller doc on 6908) - the production data move carries both users as they are | OPS production data | cutover |

## 3. Rajat's call — researched, waiting on a decision

### 3a. The 13 Sep night list — sidebars and the next features

**Decided 13 Sep 05:00 ("abhi kardo"): S1–S9, A1–A2, C1–C8 built and pushed — plan §4.32.** Still to eyeball in the browser signed in as seller and admin (the session had expired when I looked): the new sidebars with badges, Returns & issues, Promotions form, Performance, Help, admin Products/Customers. A3/A4 wait; F1–F12 still Rajat's pick.

Rajat, 13 Sep 04:00: *"sidebar wagerah improve karo. Seller ka maine chhota karwaya tha, par ab zyada hi chhota ho gaya - itna chhota nahi chahiye, kisi premium reference se lo. Admin ka badhiya hai. Customer ki kuch cheezein sahi nahi lag rahi. Future scope dekho, research karo, free me jo mile, har role ko mazaa aaye."* Researched against Shopify admin (Home · Orders · Products · Customers · Marketing · Discounts · Content · Analytics · Settings), Amazon Seller Central (Catalog · Inventory · Orders · Advertising · Performance/Account Health · Reports) and Meesho's supplier panel (Catalog · Orders · Payments · Returns · Ads · Settings — [TrackEcom](https://trackecom.in/blog/meesho-supplier-panel-walkthrough), [WareIQ](https://wareiq.com/resources/blogs/meesho-seller/)). What is real today: seller nav has 5 items; there is **no seller coupon UI** (the model supports `fundedBy: 'seller'`, only admin creates); there is **no customer account page** (name/phone/password/delete); "Contact" sits in the customer's primary nav where no marketplace puts it.

**Seller sidebar → 9 items, grouped like the admin's.** The spine is the same on every marketplace checked: Meesho (Catalog · Orders · Payments · Returns · Ads · Settings), Flipkart Seller Hub (Listings · Orders · Returns · Payments · Growth · Advertising · Support), Amazon's 2026 workspaces (My business + Action Center · Products · Supply chain · Orders · Finance · Marketing · Account Health — [EcomRanker](https://ecomranker.com/new-amazon-seller-central-interface-guide/), [SellerApp](https://www.sellerapp.com/blog/amazon-seller-central-guide/)), Shopify (Home · Orders · Products · Discounts/Marketing · Analytics · Settings). We lack exactly the four every one of them has: Returns, Promotions, Performance, Help. Groups: Home · SELLING (Orders, Returns & issues) · CATALOGUE (Products, Promotions) · MONEY (Payments) · ACCOUNT (Performance, Settings, Help & rules).
| # | Item | Why | New work |
|---|---|---|---|
| S1 | Home | as is | — |
| S2 | Orders | as is | — |
| S3 | **Returns & issues** | returns, disputes, NDR/NPR are the painful queue; Meesho and Amazon both separate them from orders | page: tabs Returns / Disputes / Delivery problems, from existing data |
| S4 | Products (All · Photo studio · Stock) | as is | — |
| S5 | **Promotions** | seller-funded coupons + a scheduled sale price; Shopify Discounts, Meesho Ads. Feeds G9 automatically | backend `/seller/coupons` (create/toggle, fundedBy seller, own products), page |
| S6 | Payments | as is | — |
| S7 | **Performance** | Amazon Account Health / Meesho Quality: cancel rate, dispatch time, NDR/RTO, rating, listing-quality average, against the rulebook thresholds; the seller sees trouble before the admin does | page from existing numbers + dispatch-time calc |
| S8 | Settings | as is | — |
| S9 | **Help & rules** | agreement, rulebook in plain words, "write to the platform" (mailto/WhatsApp) | page |

**Customer**
| # | Item | Why | New work |
|---|---|---|---|
| C1 | **Account page** (`/account`): name, phone, email, change password, sign-out everywhere, **delete my account** | every marketplace has it; India's DPDP Act needs deletion; today a customer cannot change their own phone | backend `PATCH /auth/me`, `POST /auth/change-password`, `DELETE /auth/me` (soft, anonymise) + page |
| C2 | Header: drop "Contact" from primary nav → **Help** (returns, refunds, contact, track order) in the account menu and footer | Amazon/Flipkart pattern; Contact is a footer/help thing | small |
| C3 | Account menu order: Orders · Saved · Addresses · Account · Help · (switch) · Sign out | Flipkart's order | small |
| C4 | Mobile nav: categories first, then account, then policies — keep; add **Track order** shortcut | Meesho app | small |

**Admin — reference spine (CS-Cart Multi-Vendor, Dokan, Mirakl operator: Dashboard · Orders/refunds · Vendors · Products · Customers · Finance · Marketing incl. banners/announcements · Reports · Settings).** Ours matches except:
| # | Item | Why | New work |
|---|---|---|---|
| A1 | **Products** (CATALOGUE) — every seller's catalogue in one list: listing score, hidden/inactive, Google verdict, out of stock | catalogue QA is the marketplace's job; today the admin cannot see all products anywhere | page over existing product + score + Google data |
| A2 | **Customers** (new group PEOPLE) — who, orders, spend, COD refusals/cancels, block | every marketplace admin has it; fraud signals (F11) live here | backend `GET /admin/customers` + page |
| A3 | Announcements & banners (GROWTH) — a message to all sellers, a homepage banner | later, at 5+ sellers | — |
| A4 | Settings — default commission, shipping rate, rulebook version, staff | later; env today | — |

**Customer — reference (Amazon, Flipkart, Myntra, Meesho account menus and apps).** Beyond C1–C4 above:
| # | Item | Why | New work |
|---|---|---|---|
| C5 | Header: **♥ wishlist icon** beside the cart; drop the "Shop" and "Contact" text links (the category strip is Shop; Contact moves to Help) | Myntra/Flipkart header shape | small |
| C6 | Account menu adds **My reviews** (backend `GET /reviews/me` already exists) and **Coupons** (available codes, with the rules) | Flipkart/Myntra menus | reviews page small; coupons page needs a public "active coupons" endpoint |
| C7 | **Mobile bottom tab bar**: Home · Categories · Wishlist · Cart · You | Flipkart, Meesho, Myntra apps - the single biggest "app-like" difference on a phone | component + hide the hamburger's duplicates |
| C8 | Delete account inside Account (C1) | Myntra shows it in the menu; DPDP | with C1 |

**Features worth building next (free, gate named)** — pick, do not take all
| # | Feature | Role | Gate | Free how |
|---|---|---|---|---|
| F1 | **"Ask the shop" assistant** — "laal jhumka 500 ke andar", "gift for sister under 1000" → filters + picks, answers in Hindi/Hinglish | customer | liquidity: search is where buyers who know what they want are lost | Gemini + Atlas Search we have |
| F2 | **Back in stock / price drop alerts** (email via Brevo) | customer | liquidity: a lost sale recovered | existing mailer |
| F3 | **Reviews with photos** + AI "summary of reviews" | customer/trust | trust: photo reviews convert 2× (Baymard) | Cloudinary + Gemini |
| F4 | **WhatsApp order updates** (placed / shipped / out for delivery) | customer | trust: India reads WhatsApp, not email | Meta Cloud API - utility messages ~₹0.12 each (not free; decide) or free deep-link "Share on WhatsApp" |
| F5 | **Seller coupons + sale scheduling** (= S5) | seller | recruitment: sellers expect a discount tool | — |
| F6 | **AI review reply** (seller answers a review in one tap, own tone) | seller | trust | Gemini |
| F7 | **Bulk CSV/Excel import** with AI cleanup of columns | seller | recruitment: a shop with 200 SKUs will not type them | Gemini |
| F8 | **Hindi UI** (storefront + seller panel) | all | recruitment in Jaipur: sellers who read Hindi first | next-intl + Gemini-drafted strings, human-checked |
| F9 | **Photo search** ("is jaisa dikhao") | customer | liquidity, jewellery is visual | Gemini vision → search words → Atlas |
| F10 | **Referral / first-order credit** | customer | liquidity: cheapest acquisition | coupon model |
| F11 | **Admin: fraud signals** (COD refusals per phone/address, many cancels) | admin | trust/money | existing data |
| F12 | Virtual try-on (earrings via camera) | customer | wow, but heavy and not free at quality - **not now** | — |

**Who does what:** all of the above is code (Claude). Rajat: decisions, copy checks in Hindi, WhatsApp Business (F4) signup if chosen, DPDP one-line privacy text review (C1).

**Also answered that night:** *Maps Embed API* enabled by Rajat - harmless, unused; the map uses Google's keyless embed. *"Did you read all 537 APIs?"* - names and jobs yes (catalog knowledge), exhaustive per-API pricing no; the Always-Free page and a category sweep were read live, and G19/G20 came out of the sweep.

- **Seller performance / RTO rate page.** The first piece exists (cancel rate on the dashboard and the admin list, plan §4.26); late-dispatch and RTO counts would join it the same way. Now, or at thirty sellers? (Plan §14.2)
- **Buyer-protection line on the product page.** Needs the copy — what we actually promise. (Plan §13)
- **Buyer–seller messaging.** Large. Later. (Plan §13)
- **Return label generation** — dropped as a need: in India the reverse-pickup rider brings the label (Amazon, Flipkart, Delhivery); the customer's page now says so. Revisit only if a courier asks the customer to print.
- **Request-validation layer** (Zod/Joi) — controllers validate by hand today; add when a second pair of hands starts writing endpoints.
- **Direct-to-Cloudinary uploads** once 7 MB video clips stop being enough — needs an unsigned upload preset in the Cloudinary console. (OPS backlog)

### 3b. AI beyond images and text — researched 13 Sep 2026; **decided the same evening → §2.18–2.25** (order: voice → decision agent → market insights → similar/Hinglish → trust queue → evals → gaps → small agents). Kept here for the research and the No's.

Rajat: "kae tarah ke AI hote hai… free mil raha ho, quality mast ho, professional, unique, logo ko helpful". Researched every kind that is free without a card and held each against the goals. Sources: Groq docs (Whisper v3 turbo free: 2,000 req/day, 7,200 audio-s/hour), Gemini API (audio understanding + TTS preview, Hindi), Groq `openai/gpt-oss-safeguard-20b` (bring-your-own-policy moderation; Llama Guard deprecated Feb 2026), Meesho (≈60% orders tier-4+, 70% prefer vernacular; voice+vernacular lifted conversion), Flipkart (Hindi voice search), WISMO = 25–40% of ecommerce support contacts.

| # | Kind | Free source | What it does for ShopMaster | Goal | Verdict |
|---|---|---|---|---|---|
| A1 | **Speech → text (Hindi/Hinglish)** | Groq Whisper v3 turbo; Gemini audio as fallback | Mic in Ask ShopMaster (Mummy bolke pooche), mic in the customer search bar (Flipkart/Meesho pattern), **"bol ke listing"** — seller speaks name/material/price, the form fills | seller ease · liquidity | **Build first** |
| A2 | Text → speech | Browser `speechSynthesis` (Hindi voice, zero API) first; Gemini TTS preview later | Assistant reads its answer aloud | seller ease | With A1, browser-only |
| A3 | **Moderation, own policy** | Groq gpt-oss-safeguard-20b | Reviews, dispute text, seller About/links, coupon names → flag abuse, phone numbers, off-platform deals → admin weekend queue, auto-hold | trust · weekend admin | Build small |
| A4 | **Embeddings → similar products + Hinglish search** | Gemini embeddings (have) + 3rd Atlas vector slot | "Aapko ye bhi pasand aayega", jhumka⇄earrings⇄झुमका, typo-proof search | liquidity | Build |
| A5 | Review highlights ("Customers say") | Gemini text, cached per product | Needs ≥5 reviews/product | trust | Later, at volume |
| A6 | Photo search (upload → find) | Gemini vision → text → search | Flipkart has it; our catalogue is small | liquidity | Later |
| A7 | Real-time voice agent (Gemini Live), video/music gen, OCR invoices, demand forecasting | — | No goal served now | — | No |

Assistant gaps found in the same pass (problem taxonomy in the chat of 13 Sep): suspended seller cannot reach the assistant (`requireApprovedSeller`) though they need it most; no `myPayments` (Razorpay attempt/refund status) tool; no `checkCoupon` tool; admin lacks `disputeBrief` and `customerRisk` tools; payouts-vs-Razorpay-settlement reconciliation is unseen by anyone. Each is a half-day; none started without a yes.

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
