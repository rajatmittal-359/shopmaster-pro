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

**`frontend/` was deleted on 26 Sep 2026** - this section was empty and verified on 12 Sep, the domain had been served by `web/` for six days, and Rajat had suspended the old Render site. The old app's URLs live on as 308 redirects in `web/next.config.mjs`. Originally: **not deleted until this section is empty.** Rajat, 12 Sep: the
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
upload + playback (as seller the house shop) both checked in the local browser
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
| 2.77 | **GitHub's 88 security alerts, triaged 30 Sep 2026.** The badge is **86 code scanning + 2 secret scanning**, not dependencies — `npm audit` is **0 vulnerabilities** on both apps, dev included. **The 2 secret alerts are false positives and can be closed:** both are `MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/shopmaster` in `docs/Final_Project_docs.html` (commit 7439393, Nov 2025, file since deleted) — MongoDB's own example string, the literal words *username* and *password*. **All 5 CodeQL Criticals are also false positives, checked line by line:** `pincode.js:43` fetches a hardcoded host after `/^[1-9][0-9]{5}$/`; `kyc.js:129` likewise after `/^[A-Z]{4}0[A-Z0-9]{6}$/` — six digits and eleven alphanumerics cannot carry a `/` or an `@`, so the host cannot move. `gemini.js:165/180` and `ai/imageGen.js:167` fetch a URL with no host check of their own, but every caller is guarded: `aiController` rejects anything failing `cloudinary.isOwnUrl` (a `startsWith` pinning scheme + host + our cloud name) at lines 250, 323, 417 and 567, and `boardRead`'s URL is one we minted ourselves — the seller uploads a base64 data URL and we hand back the Cloudinary link. CodeQL does not read a regex or a prefix check as a sanitiser; that is its known limit, not a hole. **High findings triaged 3 Oct 2026 — one was real, the rest are not.**
**(a) "Database query built from user-controlled sources" — ONE genuine hit,
fixed.** `panelController.requestCategory` passed `req.body.parentCategory`
straight into `Category.findOne({ _id: <it>, parentCategory: null })`. A seller
posting `{"parentCategory": {"$ne": null}}` built a query matching the FIRST
top-level category rather than none, and that id was stored on their request -
silently: nothing threw, the request was created, only the parent was somebody
else's. Small damage (categories are public, an admin reads the request anyway)
but it broke house rule 7, which every other id in the file already kept. Now
behind `mongoose.isValidObjectId`, and a malformed string is simply no parent
instead of a CastError the caller did not cause. 3 tests, written red first.
**Every other instance is a false positive**, and they share one shape:
`_id: req.params.id` paired with a `userId`/`sellerId` taken from the SESSION,
after an `isValidObjectId` guard in the handler - `assistController:47`,
`panelController:157/165/309`, `notificationController:52`,
`searchInsightsController:42`, `fairReturnsController:28/49/98`,
`addressController:69/100/114`, `sellerController:617/661`. A string cannot
become an operator, and the second clause means another user's row cannot be
reached even if it did. `risk.js` and `payout.js` never see a request at all -
their callers validate first. CodeQL does not read `isValidObjectId` as a
sanitiser; that is its known limit.
**(b) Clear-text logging, `seed.js:788/791`** - a dev seeding script printing the
seeded demo passwords so a human can log in. It never runs in production and the
passwords are `SEED_*` env values, not real ones. Not a finding.
**(c) Weak hash in `productVectors.js` and `aiCache.js`** - confirmed by reading
both: cache keys, exactly as suspected. Nothing authenticates on them.
**(d) Format string in `jobsController.js`** and the findings in test files -
same class, no untrusted input.
~~**Still to triage: the High findings**~~ — 'Database query built from user-controlled sources' (razorpay/customer/ai controllers, `risk.js`, `payout.js`, `listingTemplate.js`), 'Clear-text logging' in `seed.js:788/791`, weak-hash in `productVectors.js` and `aiCache.js` (almost certainly cache keys, not security), format-string in `jobsController.js`, and several in test files. **Claude could not close the two secret alerts** — dismissing a security alert is audit-sensitive and the sandbox refused it. Rajat closes them as *False positive*. | this list | Rajat, for the two dismissals |
| 2.76 | ~~**Availability came from five different places**~~ ✅ 30 Sep 2026 — `/charming-jewels` showed all seven products "Out of stock", with no buy buttons, while each held two units; their own product pages said "2 left". The cards compute `stock - reserved` themselves and `publicSellerRoutes`' select asked for neither field, so every card read 0. Nothing threw (`undefined || 0` is 0) and nothing went red (no test mentioned stock, and the mocks there swallow what `.select()` is handed). It had been live **eight days** — the select was written 9 Sep, the buy buttons arrived 22 Sep (880a880), and the file was never reopened. **Fixed as a system, not a patch:** `utils/availability.js` owns the sum (available-to-promise, the shape Shopify's Storefront API uses), every storefront endpoint now sends the answer beside the raw fields, and `web/src/lib/availability.js` is the only place in `web/` where the subtraction is still written — the five components that each had a copy (card, product page, cart, size picker, seller table) read from it. The low-stock threshold had three fallbacks (10 / 3 / 10) and the model's `isLowStock` counted raw stock; one number now, counted against what can be promised. Wishlist's populate was missing `reserved`, `avgRating` and `totalReviews` — also fixed. Tests assert what the query **asks the database for**, because that is what broke. 1537 passing. | this list | ✅ |
| 2.6 | ~~**Seeded products sharing the old description**~~ ✅ 26 Sep 2026 - all 53 products now carry copy of their own. The run also uncovered 2.72, which was the bigger problem. | ✅ |
| 2.9 | ~~**Sentry**~~ ✅ 13 Sep — org `shopmaster-pro`, project `shopmaster-backend`, `utils/monitoring.js`; captures 5xx from `sendError`, the error middleware and cron jobs; bodies/headers stripped. Test error received. ~~Left: `SENTRY_DSN` on Render~~ ✅ 26 Sep 2026 - present in `/srv/shopmaster/env/api.env` on the Lightsail box (Render is gone). Still open: a separate Sentry project for `web/` | Plan §7b | Render env var |
| 2.12 | ~~`seedMessy.js`~~ ✅ 13 Sep — 12 ugly cases added to the dev DB (NDR ×2 attempts, NPR, open dispute with POD, resolved dispute + refund, seller cancel with ₹50 penalty, return in transit, replacement due, 3 coupons incl. expired, payout with deduction, suspended partner seller, 0-stock + photo-less product, Leh address). **First catch: a suspended seller's products stayed on the storefront** → `utils/hiddenSellers.js`, applied to list/suggest/product page/feed/sitemap. Walked 13 Sep: **seller** dashboard/orders/payments (3 fixes: bank flag, payout deduction line, GST) · **admin** orders (dispute with POD draws right) · **customer** order page (2 fixes: passed ETA now reads *Running late*; replacement `due` no longer claims *on its way*). Still to eyeball in the browser: seller Orders tabs with NDR/NPR/penalty rows, customer order pages as Abha/Priya | this list | — |

| 2.56 | ~~**Admin Settings → Home page save should show on the home page at once**~~ ✅ 21 Sep 01:30 (overnight batch) (21 Sep 00:08: Rajat cleared the Diwali copy and the home kept it for the 5-minute `getSettings` cache). Shopify theme saves are immediate. Fix: `revalidateTag('settings')` (a small web route the API calls with the jobs token after a settings save, or `revalidate: 30` as the floor). Same for the announcement bar. | ✅ |
| 2.55 | ~~**Photo tile: a visible × on the top-right corner**~~ ✅ 21 Sep 01:30 (overnight batch) (Rajat 20 Sep 23:25: "upar bhi kahin dikhna chahiye"). Remove lives only inside the Edit menu today; Shopify's media grid and Amazon's image manager put × on the tile (hover on desktop, always on touch). Keep the Undo toast; menu item stays. 10 min, with 2.54. | ✅ |
| 2.54 | ~~**Shipping quotes from each seller's own pickup pincode (found 20 Sep 23:05 on the first outside seller's checkout).**~~ ✅ 21 Sep 01:30 (overnight batch) `calculateShipping` still quotes from the house shop's pincode (env `SHIPROCKET_PICKUP_PINCODE`); booking already goes per seller (`pickupLocation`). A Nasirabad buyer of a Nasirabad seller's 5 kg bicycle was quoted Jaipur→Nasirabad ₹202 / 5 days instead of a local rate. Fix: group billable lines by seller → one rate call per seller from `Seller.pickupAddress.pincode` (house shop keeps the env default) → sum; estimate endpoint and checkout ETA the same way; tests for one-seller, two-seller, missing-pincode fallback. Also surface **dimensions** in the product form for bulky categories (volumetric weight) - without them the courier bills more than we quoted. | ✅ |

| 2.57 | ~~**Product page essentials (Rajat, 21 Sep 00:13: "details page me kami lag rahi hai")**~~ ✅ 21 Sep 01:30: Buy now beside Add to cart (Amazon/Flipkart/Meesho); a Highlights box in the buy column - material, colour, size, weight (kg→g fixed: it said "0.5 g"), country of origin, ready-to-ship, plus up to five seller-written bullets (`Product.material`, `Product.highlights`, form fields in "2 · Words"); colour variants as photo swatches, sizes as boxes (SizePicker reads `color`/`images` on siblings; "Add a size or colour" in the products ⋯ menu); "More from <shop>" row from the seller page's products; the admin account sees a quiet note instead of "Access denied" (it is not a shopper by design - capabilities.js). Header: ♥ with saved count and bag with piece count (`GET /customer/counts`, `useCounts`, refreshed on every cart/wishlist write via a window event). **Not verified in a browser** - lint, 1244 tests and `next build` green; look at 390 px and 1440 px on the first morning. | ✅ |
| 2.58 | ~~**Checkout arrival date for a two-seller basket**~~ ✅ 21 Sep 08:10: the promise is the LATEST parcel's date, each seller's transit from their own pickup (Amazon shows the latest date when a basket splits). | ✅ |

| 2.59 | ~~Identity "leak" in the Organization schema~~ **dropped 21 Sep 09:55 - Rajat: "pata chal jaane do, hum dono ek hi hain."** Operator = Charming Jewels openly; the env fallback removal stays (links come from Settings → Links, where they are). No data change needed. | — |
| 2.60 | ~~**Google feed for all sellers**~~ ✅ **verified live 26 Sep 2026.** The `FEED_ALL_SELLERS` flag no longer exists - mixing sellers into the 1P account was the misrepresentation risk, so it was replaced by two feeds and `audience` decides: `/api/feed/google.xml` (house shop) and `/api/feed/google-sellers.xml` (everyone else), one per Merchant sub-account under the advanced parent. Checked against the live site today: both 200, the sellers feed carries **22 items and 22 `external_seller_id`** - every item, which is what Google requires or the sub-account is disapproved. The advanced account conversion and the API developer registration are both done. | ✅ |
| 2.61 | ~~**Silent `.catch(() => {})` audit**~~ ✅ 21 Sep 08:15: 51 found; 28 given a voice via `utils/quiet` (last-login stamp, email-changed security mail, refundLastError save, IndexNow flush, push cleanup, AI cache/state); the 23 left are `notify(...)` calls whose failure `utils/notify` already logs itself. | ✅ |

| 2.62 | **Category listing templates (Rajat, 21 Sep night: "har field, SEO, AI trained - har category ke liye")** — **S1 ✅ 22 Sep 00:40**: `config/listingTemplates.js` (jewellery · apparel · home-textiles · beauty · electronics · general; options = Flipkart's live facets read with Firecrawl, titles = marketplace formula, Amazon 2025 title rules, Legal Metrology lines, never-claim lists, SEO seeds), `Product.attributes/productType/templateKey/mfgDate/bestBefore`, `utils/listingTemplate` applies on create/update, the writer takes a template (schema with enums, title built from the formula, bullet recipe, relevant seeds + market-brief words) - real Gemini call proven on a dev jhumka; `GET /public/products/categories/:id/template`; product page Highlights print the attributes with labels; `backfill-listings` job fills facts on existing listings (only empty fields, seller told by bell). **S2 ✅ 22 Sep 01:40:** the form's "3b · Product facts" card asks the category's questions (dropdowns/chips/text from the template; the writer pre-fills them from the photo), mfg/best-before fields when the template's legal lines ask, and the listing score has a 10-point "facts" factor (required attributes filled). AI category guess stays as it was (the writer already names categoryName). Not verified in a browser - lint, tests and `next build` green. **S3 ✅ 22 Sep 04:10:** category pages offer the template's facets (Plating, Stone, Fabric, Thread count…) as chips counted like colours (`?attr.plating=Gold Plated`), applied-filter chips and category-change clearing included; the Google feed sends `material`, `pattern` and `product_detail` rows from the template's `feed` map. Myntra/Nykaa facet refresh still waits on readable pages. Discarded: a Myntra "facet" read that came from a maintenance page (the extractor invented it). **Backfill done 22 Sep 00:20 IST**: all 14 live listings rewritten to the template (title formula, description, highlights, facts, tags) via `backfill-listings?mode=rewrite` - a first pass over-trusted the built title ("Men Solid Trousers"), fixed the same night: the model's formula-style title wins, the built one only when unusable. Rajat, 00:30: the new data is final - no undo button, no second bell; Rahul reviews by eye. `tidy-tags` job (no model) removes the mis-attached seeds. | S1 ✅ |

| 2.63 | ~~**Backup daily**~~ ✅ 22 Sep 01:00: the box-side export now runs every night 02:30 IST (was Sunday). RPO = 1 day. Atlas Flex + PITR when orders come daily. | ✅ |

| 2.64 | ~~**Web e2e smoke tests**~~ ✅ 22 Sep 02:30: `web/e2e/smoke.spec.js` - home renders (no horizontal scroll at 390), shop lists, **product → add to cart → checkout preview (COD)**, seller panel opens, admin panel opens. CI job `e2e` in tests.yml: Mongo service → `seed.js --minimal` → API → built web → Playwright; the deploy waits for the whole workflow, so a checkout that cannot add to cart never ships. On the laptop 3 pass and the two panel tests skip themselves when the dev accounts ask for the new-device code (a fresh seed has no sessions). **CI green 22 Sep 03:05 (run 345, all 5)** after three fixes the runs taught: the standalone server (not `next start`), a hydration wait before typing into the built app's form, and the seed's three owner accounts reading `SEED_ADMIN/SELLER/CUSTOMER_PASSWORD` (not `SEED_DEMO_PASSWORD`). Deploys resumed the same minute. | ✅ |

| 2.65 | **Experience layer** (decided 21 Sep) — **E1 ✅ 22 Sep 04:50 (identity):** Fraunces display face for the storefront hero + section titles (next/font, variable, self-hosted; DESIGN.md updated), the jharokha **arch** as a shape motif on hero mosaic tiles (4:5, alternating with the square middle column), category tiles and the shop's empty state ("is being stocked"). Checked at 1440 and 390 on dev data. **E2 ✅ 22 Sep 06:10 (card & gallery):** second photo on hover, rating line, quick-add "+" on the tile (always on a phone, hover on wide), the **cart drawer** (`CartDrawer`, root layout, opens on `smp:cart-added` with the fresh cart; never on /cart or /checkout), gallery **2x magnify** under the mouse + tap-to-open black **lightbox** with arrows/keys/pinch, the photo rule line in the seller's media manager (EN/HI/Hinglish). Dropped on purpose: the *warm hero surface* (DESIGN.md forbids warm hues as UI colour - the frame competed with the goods) and *auto-clean* (stays the one-tap Edit → White background; the AI never replaces a photo unasked). **E3 ✅ 22 Sep 06:50 (motion):** `app/template.js` route-entry rise, grid stagger (first twelve tiles, 35 ms apart), press scale on every Button, **fly-to-cart** (`lib/flyToCart`, into the header bag or the tab bar's), the order-placed tick that draws itself, the seller's **first-sale** card with a burst (once per order per browser). All off under prefers-reduced-motion. Not done: React's `ViewTransition` (shared-element page transitions) - it needs Next's experimental runtime; revisit when it is stable. **E4 ✅ 22 Sep 07:25 (discovery):** **Recently viewed** (browser memory of the last twelve, `GET /public/products/by-ids`, strip on home + under the product once two cards exist), **Complete the look** ordering on the product page's shop strip (other categories first, heading changes when it has two). Suggest thumbnails and "You may also like" already existed. | ✅ |
| 2.66 | ~~**Two-step sign-in with an authenticator app (admin mandatory, sellers optional)**~~ ✅ 22 Sep 04:40 - `utils/auth/totp` (RFC 6238 on Node crypto, secrets sealed AES-GCM under JWT_SECRET, never selected by default), `POST /auth/2fa/setup|verify|disable|recovery-codes` (step-up; disable refused for admins), login and Google answer `202 totp_required` with a 5-minute pending token, `POST /auth/login/totp` takes the code or a one-use recovery code (owner mailed), replay of a window refused, ten wrong codes lock like passwords. Web: the login code step (with the recovery path), Account → **Two-step sign-in** card with a QR drawn by our own encoder (`lib/qr.js`, checked bit for bit against segno), an amber bar across admin until the admin account has it. Drilled live on the dev API (customer test account, turned off again). 10 tests. **Rajat:** enrolment is DEFERRED to the end of the project (22 Sep: "jab poora ban jaega uske baad last me") - it joins the cleanup list with key rotation; the panel's bar is dismissible, not a nag. **Found on the drill and fixed:** the sign-in limiter sat on all of `/api/auth`, so `/me`, `/refresh`, `/sessions` counted as guesses - five Account reloads in 15 min locked a person out of signing in; now only guessable routes count (case-insensitively). | ✅ · enrol at project end |
| 2.67 | ~~**Delete my account, the DPDP way**~~ ✅ 22 Sep 05:00 - `deletedAt`; sessions, bag, wishlist, bell, push and the addresses no order used go at once, every device signed out; the addresses on orders stay a year (the invoice prints them), then `jobs/retention` (daily beat with the bag reminder, or job `retention`) scrubs phone/street/landmark and a seller's bank account/IFSC/holder/PAN, `scrubbedAt` stamped. Privacy page and the Account lead say exactly that. 2 tests. | ✅ |

| 2.69 | ~~**Client/server validation parity is no longer checked**~~ ✅ 28 Sep 2026. `web/src/lib/validate.js` now holds every shared rule as DATA (`RULES`) plus `validateRegister/Address/Product`, worded with the server's own sentences so the same mistake never gets two different explanations. The three forms use it - RegisterForm, AddressPicker (checkout **and** the address book, one component) and the seller's ProductForm, which maps each broken field to the card that holds it so `smp:reveal` opens the right folded section instead of one red line above the button. `backend/tests/formValidation.test.mjs` imports that module again and checks both halves: the NUMBERS block reads `minlength`/`min`/`max` and the regex sources off the Mongoose paths themselves, and the BEHAVIOUR block runs 21 filled-in forms through both sides and demands the same verdict, the draft exception included. Proven to bite: changing `RULES.name.min` from 2 to 3 turns it red. 40 tests in that file, 1459 in the suite. Two copies removed on the way - `PIN_OK` in AddressPicker and the bare `minLength={6}` on the password box - and the forms carry `noValidate` so the browser's own bubble cannot contradict ours. | ✅ |

| 2.70 | ~~**Crawlers were walking the shop's filter combinations**~~ ✅ 26 Sep 2026. Found in the box's own Caddy log, not in any dashboard: Googlebot and GPTBot fetching `/shop?color=Teal,Maroon,Grey,Khaki,Blue,Silver` and on and on, plus Next's `?_rsc=` prefetch payloads by the hundred. Six filters that each take several values is a near-infinite URL space, and Search Console says **2 pages indexed** - every request spent on a colour permutation is one not spent on a product. The pages were already `noindex, follow` with a canonical to the clean URL, so nothing was indexed wrongly; noindex does not stop the crawl, it only stops the result. `web/src/app/robots.js` now blocks the six filters, the `attr.*` template facets, `search` and `_rsc`, and **deliberately leaves `category` and `page` crawlable** - those are how the catalogue is discovered. 6 tests in `backend/tests/robots.test.mjs`, and the allow side is tested harder than the disallow side because over-blocking is the way this fix goes wrong. | ✅ |

| 2.71 | **A deploy serves 502s to whoever is mid-request, including Googlebot.** Same Caddy log, same minute as the icon deploy: `dial tcp 172.18.0.3:3000: connect: connection refused`, then `lookup web on 127.0.0.11:53: server misbehaving`. Caddy holds the old container's IP while `release.sh` recreates `web`, so for a few seconds every request 502s - and the requests that caught it were **Googlebot's**. Repeated 502s on a crawl are an indexing risk, not just an ugly log. `release.sh` already waits for both health checks, so the containers are fine; the gap is Caddy's own upstream resolution. Fix: give Caddy a dynamic upstream (`reverse_proxy { dynamic a { name web port 3000 refresh 1s } }`) or a short `lb_try_duration` so it retries through the swap instead of failing. ~~**Needs a box step**~~ ✅ **done 26 Sep 2026, commit `cef2306`** - `deploy/Caddyfile` now uses `dynamic a { name web port 3000 refresh 1s }` with `lb_try_duration 10s` / `lb_try_interval 250ms`, and no box visit was needed after all: the deploy workflow pulls the Caddyfile from `main` on every release and `release.sh` validates it before reloading (a config that does not parse is left alone rather than taking the site down). Live since the next deploy - verified 28 Sep: the share-pack commit's markup is being served. The row stayed open here by oversight. | ✅ |

| 2.75 | ~~**The weekly brief's own-search source had never once run**~~ ✅ 28 Sep 2026. `buildBriefs` read our own search box with `$match: { createdAt: { $gte: since } }`, and `models/SearchLog` is declared `{ timestamps: false }` - there is no such field, so the match could not hit a single document. Every brief since the job was written was built from THREE sources while its own comment said four, and the one silently lost is the only source that is our own buyers rather than Google's idea of India. It failed the way the worst bugs fail: an aggregate matching nothing returns `[]`, which is indistinguishable from "nobody has searched yet" - true enough for a shop this young that the empty result looked correct for weeks. Proven against the dev database before the fix (`createdAt` → 0 terms, `day` → 3: jhumka, toe ring, one). Now matched on `day`, the YYYY-MM-DD IST string the rows are keyed by and the field `utils/googleReadiness.js` has always used. The query is an exported `siteSearchPipeline(days)` so the test can hold it against `SearchLog.schema` and fail the day it filters on a field the model does not have - a comment would not have caught this; that does. 4 tests. | ✅ |

| 2.72 | ~~**The description writer called everything jewellery**~~ ✅ 26 Sep 2026. `utils/productCopy.js` opened its prompt with *"You are writing for an Indian online JEWELLERY shop... sells IMITATION jewellery"* and rule 3 ordered the model to say so - for every product, whatever it was. Left over from when the shop sold only jewellery, and against the rule in CLAUDE.md that nothing in the frame may name a category. **Live effect: 19 products were on the site announcing they were imitation jewellery, including a Laptop Backpack 25L, a 65W GaN charger, Wireless Over-Ear Headphones, a Banarasi Silk Saree and Leather Formal Derby shoes.** Caught by reading the drafts before `--apply`, not by a test. Fix: the prompt now reads its rules from `config/listingTemplates.js` - `mustSay` (jewellery only), each category's own `neverClaim`, and occasion language that fits the product; the frame says "marketplace in Jaipur" and names no category. The draft script populates `category.parentCategory`, without which every product resolved to `general` and jewellery would have quietly LOST its required line. New `--wrong` flag redrafts only the contradictions instead of all 53. 11 tests on the prompt itself (no quota, no flake). Catalogue after: 53 products, 0 boilerplate, 19 claiming imitation jewellery and all 19 genuinely jewellery, 0 jewellery missing it. | ✅ |

| 2.73 | ~~**Audit the two sellers' live listings**~~ ✅ audited 26 Sep 2026, `node scripts/audit-listings.js` (read-only, public API, no credentials - production is a different database and the laptop has no connection to it because the read-only Atlas user `smp_read` was never created; see below). **28 live products, no blockers.** Nothing is broken or misleading. What the numbers actually say: **Charming Jewels (Mummy, 6) is the better data entry** - 2.8 photographs each, highlights, search words and the full jewellery facts (plating, stone type, closure, set contents, length) filled on every one, descriptions 77+ words. **All in one (Rahul, 22) is thin** - 1.1 photographs each, 20 of 22 with a single photograph, 21 of 22 with no weight. Ranked by what it costs us: (1) **weight missing on 24 of 28** - every courier quote for them is a guess and we absorb the difference, which is money, not tidiness; (2) **20 single-photograph listings** - the largest conversion lever on the page; ~~(3) brand spelt two ways on the house shop~~ **✅ fixed on production 26 Sep** - `backend/fixSellerBrand.js --fill-empty --apply` run on the box: 3 case fixes, 2 empty filled, and the live feed now sends one brand, `"Charming Jewels"` 6x, where it used to send two spellings. The empties were filled because the feed was ALREADY sending the shop name for them, so the database disagreed with what Google was being told; (4) 18 missing a template attribute (mostly electronics `warranty`); (5) FAQs absent on 27 - that is the field an AI answer quotes, so it is the AEO gap specifically. Feeds verified against the live XML: every item carries a brand, all 22 of Rahul's send `identifier_exists=no` correctly, and `google_product_category` is varied and right (Jewelry > Necklaces, Clothing > Pants, Toys > Remote Control Toys). **Not fixed on purpose** - most of it is the sellers' own work and overwriting it silently is the wrong move. Rajat decides what to ask them for. | ✅ audited |

| 2.74 | ~~**Read-only Atlas user so production can be inspected**~~ ✅ 26 Sep 2026. `smp_read` created with the built-in **Only read any database** role, `MONGO_URI_READ` in `private/api.env.prod`, and the laptop's IP put on the access list by EDITING the stale entry rather than adding a second one - the old home IP was still permitted and is now gone. Verified end to end, not assumed: connected to `shopmaster_prod`, 28 collections, products 28 / sellers 2 / users 6 (products matches the audit exactly), and a deliberate write probe was **refused by Atlas** - so the user is read-only in fact, not just in its label. Note for later: home broadband rotates, so that row needs editing again when it changes; the box's own `13.207.140.197/32` is separate and must never be removed. | ✅ |

### ~~2.81 The customer never sees the delivery photo~~ ✅ DONE 2 Oct 2026 — see FRONTEND-PLAN §4.71, which also closes a leak found on the way: the buyer was being sent the seller's dispute defence and the admin's brief

Found 2 Oct 2026 while checking whether we were defenceless against *"I never
got it"* - and finding we are not. `fulfilment.podUrl` is captured by
`trackingReconcile`, and the **seller** sees it (`seller/OrderDetail.jsx:361`),
the **admin** sees it (`admin/Orders.jsx:204`), and the decision agent is told
about it (`decisionAgent.js:88`).

**The customer is the only one who never sees it.** `customerController` does not
send `podUrl` and no customer page reads it.

Amazon shows the buyer the delivery photo on the order itself, and it settles a
whole class of complaint before it becomes one: the parcel was taken in by a
family member, or left with a neighbour, and the photo reminds them. Every one of
those that reaches a dispute costs an admin's evening and a seller's payout hold.

The work is small: add `podUrl` to the customer order payload and show it under
the Delivered line as "Delivered - see the courier's photo". Do not show the
courier's *signature* capture if it carries another person's name - the photo is
the useful half.

### 2.82 Same-day is wired to a simulator

Found 2 Oct 2026. `shipmentBooking.js:57` sends `deliveryOption === 'same_day'`
to `borzo.bookSameDay`, and Borzo has never left its **test host** - `BORZO_ENV`
unset means `robotapitest-in.borzodelivery.com`, which `utils/borzo.js` describes
itself as a simulator that answers happily while nothing is collected.

**Nothing is at risk today, and that part IS by design.** `utils/shipping.js:418`
checks `borzo.isPending()` and, while Borzo sits on its test host, offers
`same_day_soon` instead - *"Same-day delivery, Coming soon in Jaipur"*, with
`available: false` - and the WHY block beside it names three separate places a
request for it is refused. It even removes itself the day `BORZO_ENV` turns
production, so nobody has to remember to delete a promise. This is well done and
should not be undone.

So this row is about the promise, not a bug: the page says *coming soon in
Jaipur*, and nothing is coming until one of the two routes below is taken.

Two ways out, and the second is probably better:

1. Take Borzo live (`BORZO_ENV=production`, real token) - a second vendor, a
   second key, a second wallet to keep topped up.
2. **Move same-day to Shiprocket Quick.** Already live on the same account by
   SSO, already shares the wallet, pickup already saved. One vendor instead of
   two. Needs two answers first (both in OPS): does it serve Jaipur in working
   hours, and does it have an API - the panel is a manual form, and without an
   API it cannot be booked from code.

Until one of those is settled the page keeps saying *coming soon*, which is
honest - but it has been saying it for a while, and a promise with no date is
how a trust story quietly stops being one.

### 2.83 Pack proof should be a video, not a photo

Researched 2 Oct 2026, asking what other Indian sellers actually do about return
fraud. The answer was not what this project assumed.

**The industry's primary defence is an order-ID-linked packing VIDEO.** Meesho
contests a WFR (wrong forward return) with it; Flipkart's Seller Protection Fund
takes it as the evidence in a 14-day claim window; the named fraud types it
answers are the **empty box return** and **swap fraud**. Branded jewellery sellers
add insurance and tamper-proof packing, and the cleverest trick found belongs to
**Mia by Tanishq**: a tamper-proof sticker is packed *inside* the box, and the
buyer seals the return with it **in front of the courier**.

Against that list we have the photo (`fulfilment.packProof`), Shiprocket's
dispatch weight, and Auto Secure above ₹2,500. The gap is the video, and it is
the one the whole industry leans on - a photo shows one instant, a video shows
the item, the count, its condition and the shipping label in a single
uninterrupted take, which is what makes it hard to argue with.

The work: let the seller record a short clip instead of (or as well as) the
photo, stored against the order like `packProof` already is, and shown beside the
buyer's evidence when a claim is judged. Worth checking the storage cost first -
Cloudinary charges for video differently - and capping length hard, maybe 15
seconds, since the AWB label and the item in the box is all it has to show.

### ~~2.84 Same-day can only ever pick up from ONE shop~~ ✅ DONE 2 Oct 2026

Found 2 Oct 2026, from Rajat's question: *"Borzo me sirf Charming Jewels thodi,
aur koi Jaipur ka seller bhi to bhej sakta hai."* He is right, and the code
cannot do it.

`shipmentBooking.js:58` hands Shiprocket a per-seller `opts.pickupLocation` -
that path is already multi-seller - but gives `borzo.bookSameDay` nothing.
`utils/borzo.js` then builds the pickup from **two environment variables**,
`BORZO_PICKUP_ADDRESS` and `BORZO_PICKUP_PHONE`, and hardcodes the pickup
contact as **"ShopMaster Pro"**. `utils/shipping.js:81` decides whether to offer
same-day at all by comparing the customer's PIN against one global
`SHIPROCKET_PICKUP_PINCODE`.

So every same-day booking, whoever sold the item, sends a rider to the one
address in the env - the house shop. **A second Jaipur seller's order would be
collected from a shop that does not have it**, and the rider would have nobody
to call, because the contact name is the platform rather than the seller. The
nobody-loses test fails on the seller's side, and it fails silently: the quote
succeeds, the booking succeeds, only the pickup is wrong.

Nothing is broken today because Borzo is off in production (§2.82) and every
seller is the house shop. Both of those stop being true at the same moment.

**Built 2 Oct 2026** (8 tests in `tests/sameDayPerSeller.test.mjs`, suite 1575):

1. ☑ `borzo.sameDayPickupFor(seller)` is the one place a pickup is decided -
   the seller's own address, phone and contact (their shop name when no contact
   is named, so it agrees with `deliveryTruth.pickupAddressFor`, which never
   asked for one), the env address for the house shop, and **null** for a seller
   with nothing on file. Both the quote and the booking take it, so they cannot
   disagree about where the rider is going.
2. ☑ `isLocalDelivery(deliveryPincode, pickupPincode)` now answers for the
   seller who ships. A Kolkata seller's Kolkata buyer is local; the env default
   is only used where no seller is known.
3. ☑ A basket from two shops is not offered same-day at all, and Borzo is not
   even asked for a price - withdrawn rather than collected from the wrong one.
4. ☑ `matter` on the Borzo call was `"Jewellery and accessories"`; now
   `"Retail goods"`. One account serves every seller and the frame names no
   category.

**Still open — 2.84b, same-day per fulfilment.** Amazon and Flipkart split a
basket by seller and let the delivery speed differ per shipment; ours keeps one
`deliveryOption` on the Order, which is why a mixed basket loses same-day
entirely rather than offering it on the parcel that could have it. Moving
`deliveryOption` onto the fulfilment means the checkout showing options per
seller, `priceDeliveryOption` returning a set per group, and a migration for
existing orders. Worth doing the day a real two-seller basket appears, not
before.

The original finding:

**This is also the answer to "which other cities".** Borzo runs in nine -
Jaipur, Mumbai, Delhi/NCR, Bengaluru, Pune, Chennai, Hyderabad, Ahmedabad,
Kolkata - and nothing has to be enabled city by city: the pickup address decides
the city. Instant delivery is a rider on a bike, so it only ever works when the
SELLER and the customer are in the same city. The blocker is not Borzo's map, it
is that the code knows one pickup address. Fix the three points above and every
city Borzo serves opens by itself, the day a seller in that city signs up.

### 2.85 The seller is told the commission, never given a bill for it

Found 3 Oct 2026, from Rajat's question: *"shopmaster seller ko bill deta hai vo
bhi dekha do."* It does not. The seller's Earnings screen shows **Commission
charged** as a figure and the rate beside it, and that is the whole of it - no
document is issued, nothing is downloadable, nothing is dated or numbered.

The customer's side is right and complete (`utils/invoice.js`, `Bill.jsx`): the
SELLER is the supplier, the invoice carries their name, address and their own
serial, and it says in plain words that they are not registered under GST and
that no GST was charged. Amazon, Flipkart and Meesho all do exactly this - the
seller issues the invoice with their own GSTIN, the platform is named only as
the channel.

What those three also do, and we do not: **the platform issues the seller a
commission invoice, monthly**, for the service it supplied them. That is the
document a seller files, and the one their accountant asks for. On a GST-
registered platform it is also what lets the seller claim the GST on commission
as input credit.

Not urgent, and it cannot be finished today either: the house shop pays 0%, no
outside seller is paying commission yet, and ShopMaster Pro has no GSTIN, so the
invoice it issued could not carry GST anyway. But the day a paying seller joins,
they will ask - and the figures already exist (`sellerMoneyFor`, the charges
ledger `SellerCharge`, `utils/sellerCharges`). The work is a numbered, dated
document per seller per month, not a new calculation.

### 2.78 Ask Shiprocket to cover the parcels that are NOT covered today

Found 2 Oct 2026 while auditing Shiprocket, from Rajat's question: *"1000 tak ke
product bhi rakhte hai, sahi secure delivery honi chahiye."*

**Auto Secure is ON but only covers shipments above ₹2,500**, and that threshold
is fixed - the settings page offers Deactivate and nothing else. So a ₹1,000
necklace ships today with **no cover at all**, which is most of what this shop
sells.

Shiprocket does sell **"Selective Cover"**: per-shipment protection, chosen at
*Ship Now* as Secured / Unsecured. The panel has it; `shiprocketBooking.js` does
**not** ask for it - the payload carries no insurance flag.

The work: confirm the field name in Shiprocket's create-order API (likely
`is_insurance_opt`, unverified - check apidocs.shiprocket.in, do not guess), then
send it for orders above a threshold we choose, with the premium visible to the
seller before they ship. Worth pricing first: on a ₹1,000 parcel the premium may
cost more than the risk, in which case the honest answer is good packing plus the
tamper seal, not insurance. **Decide after seeing the premium, not before.**

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
| G3 | Merchant Center API — per-product approved / disapproved + reason. **Migrated to Merchant API (products v1) 13 Sep** — Content API sunset 18 Aug 2026 | ✅ verified (18 approved) | ✅ done 13 Sep — registerGcp + API-developer user; 18 approved read live through products v1 | seller sees Google's verdict on the product ✅; admin sees all on `/admin/google` ✅ (17 approved, 35 not in the feed — other sellers' products; feed is the house shop only, by design) | ✅ both |
| G4 | Product structured data for merchant listings — `OfferShippingDetails` (₹100, 1–2 + 3–7 days, IN), `MerchantReturnPolicy` (7 days, customer pays courier), `aggregateRating` only where reviews exist, seller = the shop | ✅ code | — | `web/src/lib/productSchema.js`, verified on a local product page 12 Sep | ✅ |
| G5 | Listing quality panel — score, checklist (title/photos/colour/size/description), AI keywords, Google preview, G1–G3 data inline | ✅ (Gemini/nano) | — | product form | ✅ 12 Sep (plan §4.30) |
| G6 | GA4 property + Data API — traffic, product views, add-to-cart funnel | ✅ | **create GA4 property → send Measurement ID (G-…) + Property ID; add the service account as Viewer; enable Analytics Data API** | ✅ built 13 Sep: gtag via `next/script`, page_view per route, `view_item / add_to_cart / begin_checkout / purchase / search`; `/admin/google/traffic` + Visitors card (sessions, funnel, top pages). Silent until `NEXT_PUBLIC_GA_MEASUREMENT_ID` / `GA4_PROPERTY_ID` are set | ✅ 13 Sep — tag live (`G-SK8WB9BKFG`), Data API answering (property 553869046, SA Viewer). Numbers fill in over the week |
| G7 | PageSpeed Insights API — Core Web Vitals per page | ✅ | done 13 Sep (key restricted to PageSpeed) | ✅ Speed card live on `/admin/google`. **First truth, live React site on mobile: Home 73 / LCP 5.1 s poor · Shop 71 / 5.9 s · product 70 / 8.3 s — all LCP poor, CLS 0.12.** This is G10's argument in numbers; re-measure the Next app the day it goes live and fix what it still shows | ✅ |
| G8 | Google Business Profile — reviews, products, posts (local pack, "near me") | ✅ | **reviews 2→30, add products, one post a week** (the shopkeeper, from the seller login); **send Instagram / Justdial / GBP Maps links** | ✅ 13 Sep: `sameAs` = Instagram, Justdial, GBP knowledge-graph link, on the Organization schema | ✅ (GBP filling = the shopkeeper, from the list in OPS) |
| G9 | Merchant promotions — coupons shown in Shopping results | ✅ | done 13 Sep — source `PROMOTIONS SOURCE 1` on the feed URL, daily 12 AM | ✅ `/api/feed/promotions.txt`; Google accepted 2 promotions 03:21 ("No issues found"); review takes 1–2 days. Lesson kept in the code: dates from the coupon, start date in the id | ✅ |
| G11 | **Google Customer Reviews** (Merchant Center programme) — after each order a one-question Google survey; enough answers earn the **seller-rating stars** under our name in Shopping and Search. Free; Flipkart/Myntra carry them | ✅ | **Merchant Center → https://merchants.google.com/mc/programs?a=5849184820 → Customer Reviews → Enable → accept terms**, then say so | ✅ built 13 Sep: checkout lands on `/orders?placed=<id>` → "Order placed" band (order number, arriving-by) + Google's opt-in module (`OrderPlaced.jsx`, fields per answer/14629205). Programme enabled + env set 13 Sep. Google verifies the opt-in on the first real orders after cutover (needs the confirmation page on the live domain). **Badge** (`merchantwidget.js`, footer) deliberately not added yet — it reads "no rating available" until surveys come back; add at ~10 ratings | ✅ (verifies itself after cutover) |
| G12 | **Postmaster Tools** — Google's own view of whether our order emails land in Gmail inboxes or spam | ✅ | done 13 Sep (verified via the existing Search Console TXT) | — | ✅ ("Not enough data" until real volume) |
| G13 | **Google Alerts** — "ShopMaster Pro", "shopmasterpro.in", "the house shop" Jaipur, daily to the admin login | ✅ | done 13 Sep | — | ✅ |
| G14 | **Google for every seller, not just the house shop.** On a marketplace the seller does NOT set Google up - the platform does it once (Amazon/Flipkart/Meesho: the seller only writes the listing). Google's structure for this (support.google.com/merchants/answer/14228975): a **Marketplace multi-client account** with a *marketplace-owned* sub-account (the house shop, today's) and a *multi-seller* sub-account carrying every other seller's products with `external_seller_id` (answer/11537846). Apply when the first real third-party seller joins; until then `FEED_ALL_SELLERS=false` is right | ✅ | Merchant Center → apply for marketplace account (Google reviews it); rename to ShopMaster Pro | feed: `external_seller_id` + seller name per item; a seller-panel page "How your products reach Google" (what we do for them, the 5 things only they can do: GBP for their shop, reviews, photos, honest titles, stock) | ☐ at first third-party seller |
| G15 | **Merchant API Reports** — per-product Shopping impressions/clicks (`product_performance_view`) | ✅ | — | ✅ 13 Sep: seller Listing panel "shown 340× in Shopping, 4 clicks (28 days)", admin Google table column. Google's product-level rows are empty so far (only non-product clicks: 4) — fills in as impressions accrue | ✅ |
| G16 | ~~**Places Autocomplete (New)** on the checkout address~~ ✅ 19 Sep, the free way (Google needs a card): PIN first - India Post fills city/state through `/api/pincode` (was built 12 Sep, never wired into the form), the courier check says "nobody delivers here yet" before paying, an unknown PIN is refused, +91/0 phones become ten digits, a landmark line (Shiprocket address_2, Borzo drop); the server repeats the check (`utils/addressCheck`) and takes the STATE from the PIN when the typed one disagrees - the field a courier booking and GST place-of-supply read. India Post down = type it yourself, nothing blocked. 5 tests + curl (999999 refused; 'RJ' → Rajasthan, Sanganer kept, tags stripped) | 10k req/month | — | ✅ |
| G17 | **Google One Tap** sign-in — one tap at the login wall, same OAuth client | ✅ | — | ✅ 13 Sep: `GoogleOneTap.jsx` on storefront routes for signed-out visitors (quiet on login/register/checkout and in the panels); GSI initialised once in `lib/googleSignIn.js`, shared with the login button. Verify visually signed-out on the live domain after cutover (Google gates One Tap on the origin) | ✅ |
| G18 | ~~**reCAPTCHA v3**~~ superseded 19 Sep by Cloudflare Turnstile (2.28) on register + become-seller; coupon apply is behind the checkout rate limit and a session | — | — | ✅ |
| G19 | **YouTube link as product video** — seller pastes a link (watch / youtu.be / Shorts), we embed; no upload, no 7 MB limit, no key (thumbnail from i.ytimg, nocookie player) | ✅ | — | ✅ 13 Sep: `utils/youtube.js` + `lib/youtube.js`, VideoSlot "or paste a YouTube link", Gallery iframe, schema `VideoObject` (embedUrl/thumbnail) for every video incl. uploads. Verified via API (set / reject vimeo / remove) | ✅ |
| G20 | **Map on Contact** — Google's keyless embed (no key, no billing, no quota) + "Get directions" | ✅ | — | ✅ 13 Sep, pin lands on the house shop. Seller shop pages: only when a seller opts in to show location (a pickup address can be a home) — later | ✅ |
| G21 | **Get found on Google - per-seller workspace** (Rajat 13 Sep: a second seller must not redo the house shop's twelve tabs by hand) | ✅ | — | ✅ 13 Sep — `/seller/grow`, measured ten-step checklist, GBP guide, review message, Settings → Your shop on the web, shop page `sameAs` schema (plan §4.35). Later: per-seller Merchant status once the marketplace account exists (G14) | ✅ |
| G22 | **Local search — the shop page as a PLACE, not only a website** (29 Sep 2026). Measured first, with Google's own autocomplete rather than an opinion: `jewellery shop near me` suggests `jewellery shop jaipur` before anything else, `imitation jewellery jaipur` returns **zero** suggestions while `artificial jewellery in jaipur` is dense (so "artificial" is the word here, not "imitation"), and every shop query in the lists carries a city or a locality. The shop page title was the shop's NAME alone — the one search nobody makes until they already know the shop; it is now `<name>, <city>`, still generic, no trade word (the frame rule holds: what a shop sells belongs in the seller's own About). The structured data said `OnlineStore` and sent the city only, so nothing ever told Google that the website and the shop's Business Profile are one business — that match is made on street + locality + postcode agreeing across the two. Now `['Store','OnlineStore']` with a full `PostalAddress`, `areaServed` (city + India) and `telephone`, **gated on `showLocation`** so a seller who ships from a flat is never published as a shopfront. API sends `legal.postal` — the same four parts it already joined into the address line, unjoined, because a joined string is the one shape structured data cannot read. Schema moved out of the component into `web/src/lib/shopSchema.js` so it could be tested at all. 18 tests (`shopSchema` 15, `publicSeller` +3), full suite 1527 green, lint clean. Applies to every seller, not the house shop. **Not claimed: opening hours and a geo point** — the platform holds neither, and hours that are wrong send somebody to a closed door. | ✅ code |
| G23 | **Google Business Profile — the local-intent pass** (29 Sep 2026, house shop). Description rewritten to carry what people actually search and what the shop actually has: artificial/fashion, kundan, meena, polki, temple, bridal, oxidised, American diamond, pearl, antique, western, a men's range — **and jewellery on rent**, which the profile had never mentioned. **41 custom services added** across the three categories (21 Jewellery Store, 10 Bangle Shop, 10 Costume Jewellery Shop) — the Services surface was completely empty and is free text, which is the only place "Jewellery on rent" can live because **Google's taxonomy has no jewellery-rental category at all** (probed the picker directly: `rent`/`rental` return car, boat, ATV and cabin). Service options set — in-store shopping ✓, in-store pickup ✓, delivery ✓, curbside ✗; *onsite services* deliberately left unset (Sterling Sky: it pushes reviews out of sight). "Identifies as women-owned" set on Rajat's word (29 Sep: *"mummy aur mai dono chalate hai"*). Why rental matters even though retail is the main trade: `jewellery on rent` autocompletes to **`jewellery on rent jaipur` as its #1 suggestion nationally**, `bridal jewellery on rent` likewise to `in jaipur`, and Maps returns **only 4 organic results** for it — one of which ranks with **zero reviews** because the keyword is in its business name. Nearly empty field, and the shops that do rank sit on Devi Nagar's doorstep (Shyam Nagar Thana, Swej Farm Rd). | ✅ live/pending review |
| G24 | **GBP products — parked by Rajat 29 Sep** (*"koi na chod do unhe vo baad me karlenge yaad rakhna"*). 2 of 7 added, 5 left. Two reasons to think before finishing: the "Necklace Sets" duplication was never verified, and Sterling Sky's replicated test found the **Products tab LOWERS knowledge-panel CTR in 10 of 11 verticals** — so the 2 already there may be worth removing rather than the 5 worth adding. Decide, then act once. | ☐ parked |
| G25 | **GBP items that need Rajat, not code** — the full version with the exact steps is `OPS-AND-MANUAL-ACTIONS.md` **A0** (the festival plan, 29 Sep); this row is the short record so the two do not drift.  (a) **Categories are locked** behind a pending edit — Gift shop and Jewellery Designer were meant to come off and still show in the pending list, so the first removal did not take; redo when it clears (Category Confusion is Whitespark's negative factor #9). (b) **Q&A seeding** — desktop Maps no longer exposes it; it is 2 minutes in the Google Maps app on his phone, owner-answered, and it is where "do you give jewellery on rent?" gets answered in the panel. (c) **Real closing time** — "open at the time of the search" is ranking factor #5 and two Maps queries showed shops with 3 and 6 reviews outranking shops with 111 and 130 purely by being open; 10–7 is on his earlier word and must not be guessed. (d) **Ear piercing** — `ear piercing jaipur` is a whole demand cluster with its own Google category (`Ear-Piercing Service`); add only if the shop actually does it. (e) **Shop photos** — his own words, *"ghar jaisa"*: warm, real, no stock. | ☐ Rajat |
| G26 | **Three data fixes on the shop's own page** (29 Sep, all in Seller Settings, all Rajat). (a) `about` currently reads *"Handmade jewellery from Jaipur since 1998"* — **handmade is wrong** (the shop retails, it does not make), it names no category anybody searches, and it contradicts the new GBP description; the site and the Profile disagreeing is exactly what breaks the entity match G22 just built. (b) **`whatsapp` is empty**, so the shop page shows no Chat button at all — somebody who lands from Google cannot message the shop. (c) `links.googleBusiness` is a `share.google/...` redirect; the canonical `https://maps.google.com/?cid=13190293917526275064` is the stronger `sameAs`. | ☐ Rajat |
| G10 | Cutover — the React app is why 8 pages are not indexed (client-rendered); Next renders them | — | October, Render card | already built | ☐ Oct |
| — | Keyword Planner / Trends volume | needs Ads account + approval | not now | — | dropped |

**First-run tour**: seller and admin ✅ (12 Sep). Customer storefront: none on purpose - Amazon and Flipkart show no tour to shoppers.

**Our own site search**: Atlas Search ✅ 12 Sep — index `products_search`
(created from the app's connection), typo/prefix tolerant, name over tags over
description, relevance order, regex fallback if Search is ever unavailable.
Live: jhumki → Pearl Drop Jhumka, kundn choker → Kundan Choker Set. Later:
synonyms collection (jhumka/jhumki/झुमका), Gemini query → filters.

| 2.15 | ~~**Cutover code**~~ ✅ 15 Sep — the 301 map in `next.config` already covered every old route; the one it could not - `/products/<mongo id>` (what Google indexed) → the slug - is `web/src/proxy.js` (Next 16's middleware): one API call for the slug, a 308, and the page by id if the API is slow. `migrateToProd.js`: dry run by default, `--write` to do it, `--with-products` for the house shop's live products (TEST/MESSY skipped); moves admin + house-shop user + Seller doc + settings (announcement off), strips vectors/counters/admin edits/risk; refuses same-database and a non-empty target; emails from `SEED_ADMIN_EMAIL` / `SEED_SELLER_EMAIL` in .env (add them - see .env.example). After: `seedCategories.js`, `search-index`, `knowledge` | OPS cutover plan | at cutover |
| 2.16 | ~~**Settings, the rest of the consumers**~~ ✅ 15 Sep — the five policy pages, the Bill and seller Help read `businessFrom(await getSettings())` (server page → prop for the two client components); `utils/shipping.js` enforces **freeShippingAbove** (basket at the price paid, sale price while a sale runs, before coupons; the cart says "Add ₹N more for free delivery" / "Free delivery - over ₹X") and **sameDayEnabled** (off = Borzo neither quoted nor offered; a request naming same_day is priced as standard); `tests/shopSwitches.test.mjs` | plan §4.37 | — |
| 2.18 | ~~**Voice**~~ ✅ 13 Sep — mic in Ask ShopMaster + search bar + product form ("bol ke listing": numbers via fast model + regex, words via draftListing), auto-stop on silence, हिंदी/Hinglish/English chip drives script and voice, answers read aloud. Phone-verified; the shopkeeper's own voice test passed 14 Sep. Left: https on cutover removes the Chrome-flag step | §3b A1–A2 | — |
| 2.19 | **Admin decision agent** — ✅ 13 Sep for disputes: `utils/ai/decisionAgent` (facts first, Gemini → Groq gpt-oss-120b → nano), "Draft a brief" on /admin/orders with recommendation + confidence + "Use this note"; verified on the live dispute (POD present → seller, 92%). 15 Sep: the seller-application brief - facts, no model (an application is a name and a signature; nothing to weigh): `utils/applicationFacts` → 'Before you approve' chips on each pending row (email verified, account age, pickup address + Jaipur, bank, GST, shop story, profile links, bought-here record from `customerRisk`). Fixed on the way: the row state read `Seller.status` (default 'active'), so every shop showed 'active' with an Approve button - now derived from suspended / kycStatus / isApproved | §3b agents | — |
| 2.20 | ~~**Market insights**~~ ✅ 13 Sep code: `utils/google/marketInsights` (both reports, 6-h cache, `{enabled:false}` until Google switches it on), seller Grow card "What the market is doing", `GET /admin/google/market`. Shows "comes with traffic" today; fills itself after cutover. Left: a card on /admin/google when data exists | §3b C | — |
| 2.21 | ~~**Similar products + Hinglish search**~~ ✅ 13 Sep — `utils/searchSynonyms` (jhumka⇄earrings⇄झुमका, lal→red, ladki→women…) widens every search and suggestion; `utils/productVectors` + `npm run vectors:products` (53 products embedded, Atlas `products_vec` - the third and last free slot) gives semantic top-up when text finds < 6 and `GET /public/products/:id/similar`; "You may also like" rail on the product page. Left: run `vectors:products` after catalogue changes (weekly job with 2.17) | §3b A4 | — |
| 2.22 | ~~**Trust queue**~~ ✅ 13 Sep text: `utils/ai/moderate` (rules for phone/WhatsApp/link/abuse in 3 scripts, always on + Groq `gpt-oss-safeguard-20b` reading our policy when it is up) → reviews held (rating counts, words wait), seller About held from the public page, coupon codes refused, dispute text marked never blocked; `/admin/trust` = held returns · reviews · Abouts · flagged disputes · restricted customers · sellers to watch, one button each, nav badge. Verified on seeded cases. Left: listing-photo safety/counterfeit check (Gemini, batch) — with the catalogue agent in 2.25 | §3b A3 + D | — |
| 2.23 | **Assistant evals + AI Gateway** — ✅ 13 Sep first cut: `npm run eval:assistant` (9 cases × 3 roles × 3 languages, graded by code: script, filler, length, next step, must-have numbers; 8/9 clean with Gemini out and Groq at its minute limit). **AI Gateway ✅ 13 Sep** - `utils/ai/endpoints.js`: with `CLOUDFLARE_AI_GATEWAY=shopmaster` every Gemini + Groq call (assistant, embeddings, voice, moderation, script rewrite) goes through `gateway.ai.cloudflare.com` - same keys, same bodies, Groq rate-limit headers pass through; log of the last 100k calls at Cloudflare → AI → AI Gateway → shopmaster → Logs. **19 Sep ✅ weekly run + trend**: `utils/ai/evals` (cases + code grader shared with `evalAssistant.js --save`), `models/EvalRun`, job `eval` Sunday 22:30 UTC after the re-index (weekly, not nightly - eleven real answers are a slice of a free Gemini day), `GET /admin/assist/evals`, **EvalTrend** on /admin/ask (12 bars, road that answered, failing cases in words); first saved run 10/11 clean. Judge-model rubric dropped on purpose: every asked-for quality is code-checkable; a judge costs quota and disagrees with itself | §3b E, decided 13 Sep | Rajat: `CLOUDFLARE_AI_GATEWAY=shopmaster` on Render (done locally) |
| 2.24 | ~~**Assistant gaps**~~ ✅ 14 Sep — tools `myPayments` (customer: payments + every refund's state), `checkCoupon` (customer/seller: live? gives? min/expiry/uses), `disputeBrief` (admin: the decision agent from chat), `customerRisk` (admin: 180-day record by email/name); suspended sellers reach `/api/seller/assist` (mounted ahead of the status wall) with `SUSPENDED_SELLER_TOOLS` only and a system line about coming back; Gemini flash-lite as road 1b when flash's free quota is out (14 Sep: flash 429 'free_tier_requests, limit: 20'); `utils/settlements` → 'Money in / out' row in the Saturday digest (Razorpay settled vs paid out, honest when unreadable). Verified live: all three new customer/admin tools called, answers pinpointed | §3b | — |
| 2.25 | **Agents, small** — ~~seller growth note~~ ✅ 15 Sep: `jobs/growthNote` - Monday 09:05 IST from Actions (`growth-note`), the three undone Grow steps (Essential first, closest to done first) as one bell row + push + mail per seller under a new seller-only **growth** category (off-switch in Settings → Notifications); no model, nothing for a finished shop; ~~catalogue agent~~ ✅ 19 Sep as the **Thursday catalogue sweep** (`jobs/catalogueSweep`, job `catalogue-sweep`, 03:35 UTC Thu): no photo · HSN/rate missing (registered shops) · MRP below price · shared description · duplicate name (variants excluded) · <40-word description · one photo - three per seller under the Growth switch, totals to the admin; no model (dry run on dev: 39/33/20/3 issues across four shops, mostly single photos). Model-shaped checks (counterfeit photo, alt text) stay out until they earn it · **MCP server** exposing the assistant's tools · ~~third text fallback~~ ✅ 14 Sep: **Cloudflare Workers AI road 4** (`utils/ai/cloudflareText`, Llama 3.3 70B with our tools through the gateway, 10k neurons/day shared with image edits; real tool call verified); 15 Sep: `generate()` (listings, refine, keywords, FAQs) also falls Gemini flash → lite → **Groq** → **Cloudflare** → Pollinations - every text feature now has five roads, photo prompts three · NVIDIA NIM reranker (later, if search quality asks) | §3b, decided 13 Sep | — |
| 2.26 | ~~**Push notifications for sellers**~~ ✅ 14 Sep — Web Push/VAPID: `models/PushSubscription`, `utils/push` (`sendToUser`, prunes 404/410, no-op without keys), `controllers/pushController` (`/seller/push/{public-key,subscribe,test}`), pushes beside the three mails in `notifySeller` (new order · return · dispute, Hindi first, deep link to the order, one `tag` per event so nothing buzzes twice); web `public/sw.js`, `lib/push.js`, `PushToggle` (one row on Home while off, full card on Settings), `app/manifest.js` for iPhone Home Screen. Verified end-to-end in the local browser (FCM subscription → push → notification shown). `npm run vapid` makes the keys. Verified on the shopkeeper's phone 14 Sep. Left: nothing | 13 Sep research (non-AI) | Rajat: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` from `backend/.env` → Render |
| 2.27 | ~~**Hindi audio lessons**~~ ✅ 19 Sep — all 7 Learn lessons × Hindi + English recorded once with Sarvam bulbul:v3 (`generateLessonAudio.js`, ₹27 of the ₹100 free credits, hash-keyed so an edit re-records one lesson), MP3s on Cloudinary `shopmaster-lessons/`, manifest `web/src/config/lessonAudio.json`, lessons moved to `web/src/config/lessons.js` as the one source. Learn shows "सुन लो" with a native player, `preload=none`. ElevenLabs not needed - closed | 13 Sep research | — |
| 2.28 | **Free Google tools surfaced where the seller/admin works** — ✅ 19 Sep the four doors (GA4 Ask insights, Search Console Insights, Merchant Center **Product Studio**, GBP suggested replies) are a list on /admin/google's Outside card - admin only, because Product Studio works on the admin's Merchant account, not a seller's. ~~Cloudflare Turnstile~~ ✅ 19 Sep - widget `shopmaster-pro` (Managed) on /register and the last step of /sell (`components/common/Turnstile`), `middlewares/turnstile` verifies on `/auth/register` and `/auth/become-seller`; off without the keys; a Cloudflare outage lets the request through and logs (a third party down must not close sign-up); 5 tests. **Render at cutover:** `TURNSTILE_SECRET` on the API, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on the web service | 13 Sep research | — |
| 2.29 | **Fair Returns** — ✅ 13 Sep part 1: modes R/X/N (category default + seller pick in the product form, shown on the product page), customer return request with kind + photos + tag confirm (server-enforced), seller pack proof + receipt check + dispute response with photos, admin return approval, customer risk record + level (prepaid-only refuses COD), six rulebook numbers in settings, assistant knows it. **15 Sep**: the promise travels with the order - `returnMode` stamped on every order line at checkout (`modesForProducts`, one category query; blank rather than guessed if unreadable), said in the checkout total box (one line when all agree, exceptions named) and in the confirmation mail (text + HTML). **Left**: nothing in code - `kind` mandatory is the env switch `RETURN_KIND_REQUIRED=true` (19 Sep, tested), set on Render the day the old app goes (OPS cutover step 8) (15 Sep checked: Shiprocket QC-return was already on - `shiprocketReturn` sends `qc_enable` + product image; OTP delivery is a Shiprocket **account** setting with no per-parcel API flag → OPS list, cutover) (15 Sep: **printable return tag** - `/seller/orders/:id/tag`, one card per unit with the shop, order, item and the mode's rule in Hindi + English, linked from Pack proof; Learn lesson 2 'Before you pack - the tag and the photo') (15 Sep: the category admin UI is built - /admin/categories, each leaf carries a default mode select and R/X/N allow-toggles; the API refuses an empty set or a default outside it) (15 Sep: the customer's account and the checkout now show the restriction and the admin's reason - `AccountStanding` - with the grievance officer as the way to object) (old app sends none). Policy matrix in plan **§4.39** (modes R/X/N + legal always-return, claim→evidence→cost table, item-came-back-wrong rule, two risk scores, amount tiers, timelines). (Rajat 13 Sep: "ladki 2 din pehen ke wapas kar de, tod ke bole maine nahi toda… dono ka dhyan, trust banegi"). Researched: Myntra/Flipkart tamper tags ("no tag, no return"), hygiene non-returnables (earrings/innerwear) with damaged/wrong always returnable (CP E-Commerce Rules), evidence both sides, reverse-pickup QC, repeat-abuser flags. Build, with 2.19: (1) category return rule admin-set - returnable / exchange-only / hygiene non-returnable - shown on product page + checkout; (2) **Pack proof** photo before "Book courier", saved on the fulfilment; (3) printable return tag + Learn lesson; (4) return request: reason, photo mandatory for damaged/wrong within 48 h of delivery, tag-intact confirm for change-of-mind; (5) Shiprocket QC-return on reverse pickup; (6) seller receipt check OK/not-OK + photos within 48 h → admin dispute; (7) customer risk score (return %, refused returns, lost disputes, RTO) → warn → prepaid-only → returns need approval → block, reason visible to the customer; (8) every ruling written on the order, appeal via /help in 7 days, 48 h ack / 30 d resolve; (9) knowledge.js + decision agent read all of it | 13 Sep research | Rajat: order a roll of tamper-evident tags for the house shop once the lesson is live |
| 2.30 | ~~**Notification system**~~ ✅ 14 Sep — research: Amazon Seller Central (categories × channel preferences), Shopify (staff + customer per order stage), Courier/monday (bell → grouped list, unread dot, mark all read). Built: `models/Notification` (90-day TTL, tag dedupe), `utils/notify` = the one door (bell row always → push if prefs → mail if prefs), `notifyCustomer` (confirmed · shipped · delivered/returned · return decided · refund · dispute decided), `notifyAdmins` (dispute opened · return awaiting approval · review/About held · new seller application), seller moments via `notifySeller` + payout paid + dispute decided + return approved; `/api/notifications` (list, unread-count, read, read-all, preferences) + push devices moved there for every role; web `NotificationBell` in the shared header (storefront, seller, admin), `NotificationPrefs` matrix on seller Settings / admin Settings / customer Account, admin `PushToggle`; `npm run notifications:backfill` wrote 83 rows of dev history. Verified in the local browser: badge, grouped panel, tap → page + read, preference flip gates the push server-side. Left: nothing | 14 Sep research | — |
| 2.31 | **WhatsApp for customers** (Meta Cloud API, utility templates: order confirmed · shipped with tracking · delivered · refund) — the India-standard channel; 1,000 service conversations/month free, utility ≈ ₹0.12/msg. Code goes through `utils/notify` as a third channel with its own preference column; built against a mock first. Needs: Meta Business verification (docs, 2–7 days), a phone number not on the WhatsApp app, template approval | decided 14 Sep (Rajat: 'jo channel wo insaan sach me dekhta hai') | Rajat, at cutover: Meta Business verification + number |
| 2.32 | **Google coach for sellers** (Rajat, 14 Sep: seller + AI 'dono ke dimaag milake'; SEO/GEO/AEO, near-me, products ranking) — **part 1 ✅ 14 Sep**: research (2026 product-page checklists: unique titles front-loading facts, Product/FAQ schema, Merchant feed, AI-quotable answers; local: reviews, distance, complete profile) + audit (listingScore, Grow ten steps, GBP guide, AI draft/refine/keywords, Merchant feed already there). Built: `models/SearchLog` (what OUR shoppers type, per day, written from listProducts) · `utils/googleReadiness` (`keywordEvidence`: Google Search Console for the seller's pages → our search box → synonym family, each with count + note; `shopReadiness`: weak products + near-me facts) · `/seller/ai/keywords` now evidence-first with G/S/≈/AI badges and counts in `ListingQuality` · `Product.faqs` (2-6 Q&As) + `/seller/ai/faqs` drafted from facts + rulebook + a card in the form; product page shows them + FAQPage JSON-LD · title-formula and FAQ factors in the score (always scaled to 100) · richer image alt (facts) · `GoogleReadiness` card on Grow (`/seller/google/readiness`) · assistant tool `googleReadiness` · Learn lesson 'Google पर दिखना' (hi+en). Verified: form shows the FAQ card and the coach; unit tests per file. Verified 15 Sep after the restart: `npm test` 1055 green in 69 s, Grow card live (74/100, 19 products), AI FAQ draft (3 Q&As incl. the 48-hour rule), keyword chips with source badges - 2.5 s each after `generate()` learned to go flash → flash-lite on a quota 429 without retrying flash (was 87 s via nano). **Left (part 2)**: catalogue agent nightly pass (alt text, weak titles, missing FAQs → draft for approval, with 2.25), admin view of weakest products across sellers, GBP post drafts from new products, category page copy | 14 Sep research | — |
| 2.36 | ~~**AI reliability pass**~~ ✅ 15 Sep — Rajat: 'image bekaar/irrelevant, voice me dikkat, text me dikkat - sahara bane, sar-dard nahi; faltu token na jale'. Built, model-agnostic (whoever answered): **images** - product facts + a scene per kind of thing in every edit prompt (toe ring on a toe, jhumka on an ear…), `utils/ai/imageGate` (Gemini lite compares before/after; a redrawn product = next model once, then an honest warning; verdict stored on the draft, 'changed' never reused), same photo+mode+words within 24 h = reused, nothing spent; **voice** - transcript gate (`looksLikeNoise`: silence fillers like 'Thank you for watching', looped words, non-words → other provider once, then 'speak again' as a 400, never inserted); **text** - listing relevance check through the synonym table (a draft about a different thing is refused), FAQ fact gate (2.35), `utils/ai/aiCache` 24-h cache for identical listing / keywords / FAQ requests (3.6 s → 0.2 s, zero tokens). Live: the gate caught a jhumka redrawn with 'double large pearls' on the first real try | 15 Sep | — |
| 2.37 | **Free tools that earn their place (Claude's side, decided 15 Sep)** — (a) ~~**Cloudflare Whisper**~~ ✅ 15 Sep - voice road **2** (Groq → Cloudflare → Gemini, Gemini last because it shares the drafting quota); `utils/ai/transcribe` is one loop over the roads with the noise gate between them; live: 2.3 s, ~12 neurons a clip; admin 'AI today' shows the three ears; (b) ~~**weekly Atlas backup from GitHub Actions**~~ ✅ 15 Sep - `backup.yml` Sundays 21:00 UTC: `backupDb.js --out` (derived collections skipped: 14 MB → 1.7 MB), tar + AES-256 with `BACKUP_PASSPHRASE` (repo is public - artifacts are downloadable by any GitHub account, so never in the clear), decrypt-check before upload, 90-day artifact; fails red on 0 documents; skips with a warning until Rajat adds the secret (OPS item 6); (c) ~~**IndexNow**~~ ✅ 19 Sep - Bing Webmaster verified (GSC URL-prefix import) and `utils/indexNow`: product create/update/delete queue the product page + /shop + the seller page, one batched POST to api.indexnow.org 5 s later; key file `/<key>.txt` in web/public and frontend/public; `INDEXNOW_KEY` in .env (Render too). First live ping 202; (d) ~~**Sarvam**~~ ✅ 19 Sep - `utils/ai/sarvam.js`: saaras:v3 as voice road **2** (after Groq's free 2,000/day - Sarvam bills ₹30/hour per second from ₹100 credits), with `mode: translit` for the Hinglish chip so roman Hinglish comes straight from the clip and the Gemini rewrite is skipped (checked live: codemix keeps Devanagari, translit romanises); bulbul TTS used once for the lessons (2.27), not per answer - the assistant's 'Listen' stays the browser voice (free, offline); (e) **Clarity** snippet at cutover week (project id from Rajat) | 15 Sep | Rajat: OPS list items 1-5 |
| 2.53 | **Production on AWS (decided 20 Sep 04:30, Rajat: "plan change - deployment AWS pe hoga")** — one Lightsail instance, Mumbai, 2 GB ($12): API + web as Docker containers behind Caddy (auto HTTPS); GitHub Actions builds images → GHCR, the box pulls (never builds); Budgets, S3 backups, SSM Parameter Store secrets, CloudWatch+SNS alarms. Rejected with reasons in OPS: App Runner (closed to new customers Apr 2026), Amplify (Next ≤ 15 official), EC2 free tier (1 GB). **Code to write (Claude):** `backend/Dockerfile`, `web/Dockerfile` (standalone output), `deploy/compose.yml`, `deploy/Caddyfile`, `deploy/bootstrap.sh`, `.github/workflows/deploy.yml`, health checks, `next.config` `output: 'standalone'`, `web` API base for the container network. **Rajat:** account + Budget + IAM + Lightsail instance + static IP + SSH key (OPS, 30 min). Then the swap (OPS steps 6-10) | 20 Sep chat | Rajat: AWS account + instance |
| 2.52 | ~~**A cancellation is heard by everyone who did not press the button**~~ ✅ 20 Sep - the first live seller-cancel (CB0E74, from the new web) showed the dialog promising "the customer is refunded and told why" while NO path (seller/admin/customer cancel) told anyone. Now `cancelOrderFor` → bell + mail: seller/admin cancel → customer reads who, why, where the money is (raised / queued / nothing charged); customer cancel → confirmation to the customer + "customer cancelled, stock back" to each seller; admin cancel → seller too. Also seen live: penalty 0 inside the monthly allowance, stock 19 → 20, refund queued (balance short again), cancel-rate 13.3% on the house shop's card (two test cancels - dev data) | 20 Sep test | — |
| 2.51 | ~~**Shiprocket's whole vocabulary, and what each word costs whom**~~ ✅ 20 Sep (Rajat: "shiprocket ke kya status hai aur apne yaha kya hai... proof based... finalize ho jaye"). Read Shiprocket's status glossary (forward · NDR · RTO · returns · weight-discrepancy) against `utils/courierStatus`. **Found:** 'RTO Initiated' read as `returned` the moment the courier turned around (seller had nothing, prepaid customer never refunded - ever); Lost/Damaged/Destroyed/Disposed mapped to nothing (parcel 'shipped' forever); Pickup Exception/Rescheduled told nobody (seller waits for a van that is not coming); 'Return Delivered' (the customer's return leg) matched /deliver/; Misrouted/Reached-hub unmapped. **Built:** facts vs transitions - `rto`, `lost`, `pickup_failed`, `return_leg`, `ndr` are recorded on the fulfilment (`rtoAt/rtoReason`, `lostAt/lostReason`, `pickupIssue/At`) and returned as `events`; `utils/courierEvents` rings the bells for webhook AND reconcile alike: NDR → customer 'keep your phone on' + seller; RTO started → customer/seller/admin; **RTO delivered → stock back, prepaid refund raised (queue-aware), lines cancelled, customer + seller told**; lost → admin 'raise the claim in Shiprocket (₹5,000 insured)' + customer 'settled within two working days' + seller; pickup failed → seller. Customer page shows RTO/lost bands; seller queue shows 'Pickup did not happen' / 'Coming back (RTO)'. **Corrected a promise:** Shiprocket has NO doorstep-OTP switch (their 'Order Verification' is a pre-ship tag) - the rulebook's `otpDeliveryAbove` is now 'high-value: courier POD required before a not-received claim is decided + admin review'; knowledge.js and the admin label say so. 9 tests. Already right and kept: courier decides delivery (`deliveryTruth`), POD captured from tracking, QC return pickups with product image, pack-proof photo + return tags, receipt check, unboxing video above ₹X, disputes to admin, risk ladder | 20 Sep chat | — |
| 2.50 | ~~**Order status the customer's way (tracking audit)**~~ ✅ 20 Sep (Rajat: "logistics ke status dekh lena... professional format kya hota hai"; `/frontend` + ui-ux-pro-max loaded, Baymard's 6 details, Amazon/Flipkart/Shopify) - `lib/orderStatus.customerStatus` is the ONE map from `status` to words+tone (Confirmed · Being packed · On its way / Out for delivery · Delivered · Cancelled · Returned · Payment not completed) - list, order page and parcel header read it; `common/StatusBadge` is the one badge (variant map, never wraps) used by those and the seller queue; the stepper's third step becomes **Out for delivery** when the latest scan says so (Amazon/Flipkart/Shopify all give it a step); **a delivery date from day one**: the checkout's standard option now quotes a DATE (`By Wed, 23 Sept`, PIN estimate = ready-to-ship days + courier transit, cached per PIN) and stamps it as `deliveryPromisedBy`, so the order page says 'Arriving by …' before the courier has scanned anything, courier ETD replaces it later, 'Running late' when it passes; the 'Order placed' band no longer prints an invented +7-days date; `getMyOrders` hides unpaid online attempts (drill L3's ghost 'Pending ₹1'); date block keeps its height (no jump); 'Placed 19 Sept' drops this year's year. Judged and left: a 5th step (Flipkart fits 4), a map (no courier gives coordinates) | 20 Sep chat | — |
| 2.49 | ~~**The first live ₹1 payment, end to end (19 Sep 23:42)**~~ ✅ - Abha (test customer) → nose pin ₹1, free delivery, UPI via live Razorpay → order SMP-260919-51B963: paid, `pay_…` recorded, reservation consumed, invoice CJ/26-27/00005 issued, fulfilment dispatchBy 22 Sep, seller bell 'नया ऑर्डर', admin list + detail, seller moved it to processing; customer cancelled. **Three things it caught, all fixed the same night:** (a) same-day showed as a selectable 'Free' option while the API said `available:false` (Borzo test mode) - now dimmed, disabled, 'Coming soon in Jaipur', no price; (b) `&rsquo;` printed literally in the new 'Ships by' line; (c) **the refund**: Razorpay live answered *'Your account does not have enough balance'* (nothing is in the merchant balance until the first settlement, T+2/3) and the cancel was REFUSED - a customer with an unshipped order blocked by the platform's cash flow, and the SDK error's `.message` is undefined so the log said nothing. Now: the cancel goes through, the refund is `queued` (`Order.refundStatus`, `refundQueuedAt`, `refundLastError`), the customer reads 'refund of ₹1 queued, goes out within two working days', the admin gets Razorpay's words in the bell, a job `refunds` (Actions every 2 h at :45, `utils/refundQueue.retryQueued`) retries until it goes through → processing + customer mail; still waiting after 3 days → daily admin reminder; any other gateway answer → `failed` + bell. Seller-side partial cancels keep the old refusal. Also: a fully-cancelled seller line no longer reads 'paid out 7 days after delivery' (`nothing_owed`). 1223 tests. **Live order state now:** cancelled, refund queued (Razorpay balance ₹0) - it will go out on its own once the ₹1 settles or funds are added; Rajat can also refund it from the Razorpay dashboard, the refund.processed webhook then completes it | 19 Sep test | Razorpay balance |
| 2.48 | ~~**Made-to-order, seen by the customer after paying too**~~ ✅ 19 Sep - the order page's timeline shows "Ships by <date>" while pending/processing (amber "Not dispatched yet" once passed), with the made-to-order line when the order carries one; the confirmation mail says "Made to order - ships by 28 Nov" instead of the rulebook's 1-3 days. Nothing invented: only the `dispatchBy` stamped at order time | 19 Sep chat | — |
| 2.47 | ~~**Ready-to-ship days per product**~~ ✅ 19 Sep (Rajat: "hnn kardo agar aur bade log bhi aesa karte hai" - Etsy processing time, Amazon handling time per SKU, Flipkart/Meesho dispatch-by) - `Product.processingDays` (null = rulebook, 1-30), `utils/dispatch` (cleanProcessingDays / processingDaysOf / isMadeToOrder / leadDaysOf / dispatchByFor); the promise is frozen on the order line (`items[].processingDays`) and each seller's fulfilment gets `dispatchBy` = placed + longest of their lines in working days (Order pre-validate). Seller: product form 'Ready to ship in' (standard / 3-30 working days · made to order, Hindi+Hinglish); Orders queue shows 'Dispatch by <date>', red once passed. Customer: product page 'Made to order · ready to ship in N working days'; `/pincode/:code/delivery?product=` puts the product's days in the date; checkout standard ETA stretches ('7-8 days · made to order') and same-day is not offered for a made-to-order basket. Performance: late dispatch graded against the order's own `dispatchBy` when present. 5 tests + curl walk (45 refused, 7 saved, estimate 24 Sep → 30 Sep, checkout ETA, hook stamps 28 Nov vs 23 Nov for two sellers). Left: `deliveryEstimate.DISPATCH_DAYS` is still the hardcoded 2 for products without their own number (the rulebook's live value would need untangling a require cycle) | 19 Sep chat | — |
| 2.46 | ~~**Managed from the UI, not the code — the two gaps the audit found**~~ ✅ 19 Sep (Rajat: "UI pe sab cheez ka management kar rakha hai na... reference le lena"; audit against Shopify Settings, Seller Central Settings, Sharetribe Console - ~80% already in admin Settings; two real gaps, both built): (1) **Home page from Settings** - `PlatformSettings.home` {kicker, title, lead, featuredTitle, featuredHref (/shop link with filters = a saved search = a 'collection'), featuredUntil}; admin Settings → **Home page** tab; `Hero` takes the copy, `app/page.js` renders the strip above 'Just added' via `lib/homeFeatured.featuredQuery` (off by itself after the date). Diwali 8 Nov without a deploy. (2) **Seller break** (Etsy Vacation Mode / Seller Central Holiday) - `Seller.vacation {on, until ≤60 days, note}`, `utils/vacation` (onBreak/breakOf/cleanVacation/firstOnBreak/activeFilter); seller Settings → Shop → **Taking a break**; while on: products leave every list/search/feed/sitemap (`hiddenSellers` filter = suspended OR live break), product page + shop page stay up with the note and a disabled buy button, COD and prepaid checkout refuse in words naming the shop and the date, the switch expires the day after `until`; orders already placed keep their dispatch clock (the card says so). 5 tests + curl walk (admin block, bad link refused, break on → 0 house-shop products in the list, product page answers with the note, checkout 400 with the sentence, break off → back). Judged not worth a UI: tag IDs (admin = developer, Render env is a minute), email templates / staff roles / policy-text CMS (one admin), `RETURN_KIND_REQUIRED` (a cutover flag that dies with frontend/, not a permanent switch) | 19 Sep chat | — |
| 2.45 | ~~**Marketing plumbing that costs nothing and compounds**~~ ✅ 19 Sep (Rajat: "ab jo bhi apne faede ki cheez hai karo - scope define kardo"; the six agreed, all free, all built the same evening) - (1) **Borzo wallet** read before same-day is offered (`utils/borzo.balance/canAfford`, 10-min cache; ₹0 → option hidden + one admin bell a day `borzo-low-<date>`; unknown balance hides nothing). (2) **Cookie choice** (DPDP): `web/src/lib/consent` = one cookie `smp_consent` (`all`/`necessary`) read by both apps; `ConsentBanner` bottom card, two equal buttons, only when a tag is configured and the host is real; footer **Cookie choices** reopens; privacy page §Cookies rewritten. (3) **GA4 Consent Mode v2**: starts denied (cookieless pings), granted on accept; the gtag queue is built in an effect so the first page view is no longer lost. (4) **Meta Pixel + Conversions API**: `MetaPixel.jsx` loads only after accept (`NEXT_PUBLIC_META_PIXEL_ID`), PageView per route, ViewContent/AddToCart/InitiateCheckout/Purchase mirrored from the GA helpers; `utils/metaCapi` sends the server Purchase (hashed email/phone/user id, `_fbp`/`_fbc`, `event_id` = order id for dedupe) after COD and Razorpay confirm, only with the consent cookie; env `META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE`; 4 tests. Nothing is bought - the audience just exists the day an ad is. (5) **Share cards**: `app/opengraph-image.js` (brand card for every page without a photo, incl. photo-less products) and `app/sellers/[id]/opengraph-image.js` (shop name, city, count, three products) via `next/og`; satori needs explicit flex on any two-child node. (6) **Meta catalog** = the existing `/api/feed/google.xml` (Meta reads the Google RSS format; required columns already there) - a Commerce Manager step in OPS, no code. (7) **Bag reminder** `jobs/cartReminder`: bags 20-48 h old, once a week at most (`Cart.remindedAt`, stamped before the mail, `timestamps:false`), only live in-stock items at today's price, **no coupon** (Baymard/Amazon), new notify category `reminders` with its own switch; Actions daily 04:45 UTC → job `cart-reminder`; 5 tests. **Rajat, when ready:** Meta Business → Events Manager → create pixel → id to both envs + CAPI token; Commerce Manager → catalog → scheduled feed URL. Not done on purpose: referral programme, paid ads, WhatsApp Cloud API, phone OTP | 19 Sep chat | Pixel id (any time; nothing breaks without it) |
| 2.44 | ~~**Sessions the way the big ones do it**~~ ✅ 19 Sep (Rajat: "sabse pehla system yahi banana padta hai") - `utils/auth/session`: 1-hour access JWT {userId, role, tv, sid} + 30-day refresh token (random, stored as SHA-256 in `Session`, rotated on use, reuse ends the family) in httpOnly+Secure+SameSite=Lax cookies, first-party because Next proxies `/api` to the API; Bearer header still accepted (old app, tests). Middleware checks `tokenVersion` (log-out-everywhere / password change / reset bump it) and requires `X-Requested-With` on cookie writes (CSRF). `/auth/refresh`, `/logout`, `/logout-all`, `/sessions`, `DELETE /sessions/:id`, `/reauth`. **Step-up** (10-min cookie, `requireRecentAuth`) on bank details, payout paid, dispute resolve, commission - the page opens a password dialog and retries (`components/common/Reauth`). Per-account lock 10 wrong → 15 min + mail; new-device sign-in mail; `AuthEvent` 180-day audit. Account → "Where you are signed in". **Same day, emailed one-time codes** (`utils/auth/oneTimeCode`: hashed, 10 min, 5 tries, 60-s resend; SMS costs money, Brevo is free): second step for **seller/admin on a device the account has not used in 90 days** (Shopify's staff 2FA, free version; customers get the new-sign-in mail only); step-up by code for Google-only accounts ("Email me a code instead" in the dialog); **change sign-in email** (step-up → code to the NEW address → every other device out, old address told); delete account behind step-up; **throwaway domains refused at sign-up** (`disposableDomains`). **Left:** admin view of a customer's AuthEvents (when a dispute needs it) | Rajat 19 Sep | — |
| 2.43 | ~~**Health that means something**~~ ✅ 15 Sep — `GET /api/health`: 200 only when Mongo pings back inside 2 s, else 503 with the reason (the process answering is not the shop working); `.github/workflows/health.yml` asks every 30 min from outside and turns red (GitHub mails) on anything but 200 - the free floor under UptimeRobot, not a keep-alive. Point UptimeRobot at `/api/health` too | 15 Sep | Rajat: UptimeRobot URL = /api/health |
| 2.42 | ~~**Edit a shop's details on its behalf**~~ ✅ 15 Sep — Rajat: 'koi aur karta hai? sach me zaroorat padti hai?' Researched: Sharetribe Console (edit user fields + "Log in as a user" - 'helping users edit their listings or profiles'), VTEX/HCL (operator 'can perform all tasks on behalf of the seller, including updating seller details'), Webkul/Dokan/WCFM 'login as vendor' - the commonest support ticket is 'my address/link/story is wrong'. Built the narrow version: `applyShopSettings` is now the ONE set of rules for the seller's Settings and for `PATCH /admin/sellers/:id/shop` (about, links, pickup address, city shown, free delivery - never the bank); every changed field named; `Seller.adminEdits` (who/when/fields/note, last 20); seller gets bell+push+mail 'Admin updated your pickup address · एडमिन ने बदला' with the admin's note; /admin/sellers ⋯ → 'Edit shop details for them' dialog shows earlier edits. Not built: full 'login as' (audit/token risk, no need at our size) | 15 Sep | — |
| 2.41 | ~~**The law's lines, on the site**~~ ✅ 15 Sep — Rajat: 'humesha sahi ho, legally, ethically; koi ungli na uthaye'. Audit against the Consumer Protection (E-Commerce) Rules 2020 (+ the 2026 amendment, in force 1 Jan 2027), Legal Metrology (Packaged Commodities) Rules and the DPDP Act 2023. Built: **grievance officer** (Settings → Business: name, designation, email, phone → Contact, Privacy and Terms with the 48-hour / one-month clock and the 1915 helpline; rule 4); **seller of record** on every shop page: legal name · business address · GSTIN or 'not registered' · link to the grievance officer (rule 6(5)); **country of origin** on every product (default India), **net quantity** and **manufacturer / packer** for packed goods (Legal Metrology rule 6(10)) - form fields with the why, product page facts; **/how-we-rank** - the ranking parameters in plain words (rule 5(3)(e); newest by default, search by name > words/brand/colour > description, sorts, no paid placement, no seller preferred), in the footer's policy list; invoice already in the seller's name (2.40). Checked, nothing to change: total price with breakup at checkout; free cancellation before dispatch; return/refund policy per item; no fake urgency (stock counts are real); no own-shop boost anywhere in listing or search. **Rajat:** name the grievance officer in Settings (can be you) | 15 Sep | Rajat: Settings → Business → Grievance officer |
| 2.40 | ~~**Seller verification, the way the big ones do it, sized for us**~~ ✅ 15 Sep — Rajat: 'Amazon/Flipkart/Meesho seller se kya maangte hain, verify kaise, approve kaise; apne level pe best; AI sirf jahan sach me kaam aaye'. Research: Amazon (PAN, GSTIN/exempt, bank proof, address proof, video KYC, 2–5 days), Flipkart (GSTIN, PAN, bank, pickup, signature; fails on GST↔PAN name), Meesho (PAN, Aadhaar, bank, GSTIN **or** the GST portal's Enrolment Number - notification 34/2023: intra-state, < ₹40 lakh), E-Commerce Rules 2020 (marketplace shows legal name, address, contact, GSTIN). Built: `utils/kyc` - PAN shape+type, GSTIN mod-36 checksum + state + embedded PAN, enrolment number, IFSC shape + Razorpay open lookup (bank/branch stored on save), PIN↔state, loose name match - all free, offline, a millisecond; `Seller.application` (legal name, PAN, gstMode gstin/enrolment/none, phone, city, PIN, sells, shop photo, boardRead, status submitted/needs_info/approved/rejected + reasons); apply validates as it comes in (400 with the sentence); `GET/PATCH /seller/application`; admin list carries `checks`, `duplicates` (same PAN/GSTIN/phone/bank on another shop - a query, not a model), board read; `PATCH /admin/sellers/:id/ask`; approve/ask/turn-down each ring the shop (bell+push+mail). **AI, one place only:** the board photo is read once by Gemini lite ("board reads 'the house shop's" / "not a shop") - the video-KYC question without the call; no OCR, no face match, no risk score (6 sellers, nothing to learn from). UI: /sell = 3 steps (shop · identity · agreement) with live ✓/reason per field and the why under each; ApplicationStatus (submitted / asked-for with the sentence + fields to fix / turned down + resend) on /sell and the dashboard; /admin/sellers = Shopify-shaped table (Waiting · Selling · Suspended · Turned down tabs, status pill, agreement, commission inline, cancels grey under 10 orders, ⋯), pending rows open on "Before you approve" chips + photo + Approve / Ask for… / Turn down; public seller page: "Sold by <legal name> · GSTIN …" (+ schema legalName/taxID). Tests: kyc 13, sellerApplication 11, boardRead 2. Not built (faltu at our size): Aadhaar/DigiLocker, penny drop (first payout is the penny drop), video KYC, signature scan, category approvals | 15 Sep | Rajat: try /sell with the customer test account; open /admin/sellers |
| 2.39 | ~~**Long pages read at a glance**~~ ✅ 15 Sep — Rajat: 'pages bahut neeche jaate hain, at a glance samajh aaye, gabrahat na ho; table, tab, chevron cards; step by step par rigid nahi'. Measured first: Grow 5.7 desktop / 7.7 phone screens and 1,900 words, product form 5.0 phone screens, header overflowing 304 px at 390. Built one pattern (NN/g progressive disclosure; Shopify's folded sections, Seller Central's tabs, Linear's counted groups): `panel/Fold` (chevron card with a one-line summary when closed, remembered per section, opens itself when a fix link targets a field inside - `smp:reveal`) and `panel/PanelTabs` (URL `?tab=`, counts). Applied: **product form** - health bar at the top (ring + one word + ONE next fix with its points + 'All N'), sections 1–7 fold with summaries, Q&A optional and folded, Google block folded at the end; **Grow** - five tabs (Do now · On Google · Fields · Market · Guide), done steps folded behind '{n} done'; **header** - role switch and language into the phone menu, account as an icon on xs; **products list** - the row says it can be edited (pencil on hover, Edit, ⋯ menu: Add a size · View in shop · Hide/Show with Undo), a dashed 'add photo' tile when there is none, and under 80 the row carries its score and best next fix as a deep link into the editor (Amazon LQD). After: Grow 2.5 / 4.4 screens, form 2.9 on a phone, no overflow. Settings too: seller (Shop · Pickup address · On the web · Notifications; a dot on the tab with an unsaved change, the save bar names it; `#web` links still land) and admin (Business · Rulebook · Switches · Announcement) - 5.6 → 1.5 phone screens. Hindi + Hinglish for all of it (health bar words, the 16 fix texts, section summaries, products list rows, Settings tabs, Grow tabs) | 15 Sep | — |
| 2.38 | ~~**The two worlds of Google, on screen**~~ ✅ 15 Sep — Rajat: 'andar ki duniya (website/code) aur bahar ki duniya (manual, Google pe) - classification, essentials vs optional, har field, kiska kya faeda; har seller ke liye, sirf the house shop nahi'. Seller Grow: **On ShopMaster - you do it here** (steps with Essential/Optional badges, +1 step 'Two answers under every product') · **On Google - only you can do this** (GBP claim, reviews 2→30, weekly post, NAP consistency, products auto after Merchant link) · **Every field that matters** (14 rows: field · where · what it earns) · the 'never' line; Hindi + Hinglish for all of it incl. step titles. Admin Google page: `GoogleMap` - Inside (8 things the code does for every seller) vs Outside (7 console tasks, done dates, the two open ones: Bing Webmaster, GBP) with live Merchant/GA4 numbers | 15 Sep | — |
| 2.35 | ~~**Answer gate**~~ ✅ 15 Sep — Rajat: 'kuch AI bekaar/irrelevant output dete hain, aisa na ho'. `utils/ai/answerGate`: every road's answer is judged live before it is returned - **order numbers must exist and belong to the asker** (DB check), no filler, no markdown, ≤260 words, no refusal while tools exist; a failing answer sends the question to the next road, the last road's answer is repaired mechanically; `'gemini'` mode repairs instead of re-routing. FAQ drafts drop any answer claiming purity/hallmark/real stones/origin the listing never stated. End-of-prompt 3-line checklist for small models. Eval: 9/11 → 10/11 clean, with Groq and Cloudflare Llama answering cleanly when lite was rate-limited. Left: the 72-hour Hindi case is flaky on lite (1 in 2) - watch in the nightly eval (2.23) | 15 Sep | — |
| 2.34 | ~~**Model selection, honest + admin "AI today"**~~ ✅ 15 Sep — seller keeps **Automatic** (5 roads named truthfully in the picker; Gemini-only / nano-only stay for those who want them; the model's name under every draft); admin AI page gets `AiRoads` (`GET /admin/ai/roads`): the five roads in order, which are out of quota right now (Gemini flash 10-min memory, Groq per-minute tokens), who answered how often today, link to the gateway log. Same pass: every new card's lead cut to one line, verb first, keyword bold (Rajat: 'no faltu lambi baat') | 15 Sep | — |
| 2.33 | ~~**Docked assistant**~~ ✅ 14 Sep — Rajat: 'AI ka response side me dikhe jisse uske batae steps kare'. `AssistDrawer` mounted in `PanelShell` (seller + admin): sparkle button in the header, a right-hand column on desktop (page stays clickable), a bottom sheet on phones that minimises to one line (the last answer's first sentence); thread kept in sessionStorage per role, so it survives navigation and reload; Esc minimises. Reference: Shopify Sidekick, Intercom. Verified: ask → tap the link → /seller/orders with the answer still beside it; reload keeps it | 14 Sep | — |
| 2.17 | ~~**Weekly re-index**~~ ✅ 14 Sep — `vectors` job (`POST /api/jobs/vectors`, needs GEMINI_API_KEY) re-embeds changed products; GitHub Actions runs it Sunday 22:00 UTC; the knowledge base (built from the repo's files) re-indexes in the same workflow with a checkout once `MONGO_URI` + `GEMINI_API_KEY` exist as repository secrets - it skips with a notice until then | — | Rajat: GitHub → Settings → Secrets and variables → Actions → add `MONGO_URI`, `GEMINI_API_KEY` (2 min) |
| 2.13 | ~~**Hindi, the rest of the seller panel**~~ ✅ 15 Sep — every seller page is now clean in Hindi and Hinglish: Home, Orders, Returns & issues, Products list + form, Grow, Payments, Performance, Promotions, Settings (tabs + body), Help; checked by walking every text node on each page with the toggle on - only names, the shop's own About and what customers typed stay English. Learn's lessons were bilingual already. ~500 rows per dictionary; the two must stay in step (`lib/i18n.hi.js` / `hg.js`) | 13-15 Sep | — |
| 2.14 | **Two accounts, fixed (Rajat 13 Sep):** the house-shop seller login = the the house shop **seller**, the admin login = the **admin**. Never merged. Verified in the dev DB 13 Sep: already exactly so (both Google-linked, Seller doc on 6908) - the production data move carries both users as they are | OPS production data | cutover |

| 2.68 | **The outside web, where it is worth it (24 Sep 2026)** — `utils/research` (router: database → Gemini grounded → Gemini url_context free → Firecrawl only for pages that block Google or when photographs are needed; SSRF guard, day cache, 25-reads-a-day cap, month-credit reserve, counted in `AiUsage.research`). **S1 ✅ "Already selling this somewhere else?"** — the seller pastes their own listing's link, the facts and up to five photographs fill the form as a draft (`utils/ai/importListing`, `POST /seller/ai/import`); proved on real Meesho and Amazon pages. **Left:** S2 the category recipe (admin: facet options **and** a photo recipe per category, replacing the fifteen hand-written `SCENES` lines in `imageGen`); S3 the weekly brief's reality leg (one real category page a week); S4 `readWeb(url)` for the assistant. Key is `FIRECRAWL_API_KEY` (personal account, 1,000 credits/month, resets the 26th) — **not on the live box yet**, OPS 18b. | S1 ✅ |

## 3. Rajat's call — researched, waiting on a decision

- ~~**One-word environment switch**~~ ✅ 21 Sep 06:30: `ENV` file (local | prod) + root `npm run server` / `npm run web` (scripts/run.js). prod = private/api.env.prod with the READ-ONLY user `MONGO_URI_READ`, cron/mail/push off, red banner in terminal and page. Rajat's step: create `smp_read` in Atlas, add `MONGO_URI_READ=` to private/api.env.prod, install Compass (OPS). Never builds; prod images come from Actions.
- ~~**Market check button**~~ ✅ 21 Sep 07:30: "4 · Price and stock" → **Check the market** → one grounded call (Gemini; Groq compound when Gemini's day is out), cached a day per title: price band + sites + the words buyers type (tap = add to search words) + where the seller's price sits. Real call proven: AD necklace set → ₹800–2,500, typical ₹1,300, 8 phrases. Advice only.
- ~~**Market brief agent**~~ ✅ 21 Sep 11:30: weekly job `market-brief` (Monday 08:45 IST, before the growth note) builds one `MarketBrief` per selling category from Search Console queries + the site's SearchLog + Merchant Center insights (still "not enabled" by Google until traffic) + one grounded search (Gemini, Groq compound fallback; paced, resumable, ≤12 per run). Ask ShopMaster has a `marketBrief` tool it must call BEFORE webSearch for price/trend/keyword questions - zero tokens for the facts. `GET /admin/market-briefs` for the admin; a card on the admin Google page is S2. Real build proven on dev data: 14/30 categories with bands (rate limits pace the rest). Not yet: Google Trends (no official API), auto-pricing (never).
- **PARKED 19 Sep 2026 — the two couriers (Rajat: "in dono me kaam bacha hai... abhi side rakh dete hai, document karlete hai").** Both block a real order's *dispatch*, neither blocks anything else, and the code is already safe on both: same-day shows as "Coming soon in Jaipur" and cannot be bought while `BORZO_ENV` is not `production` (`utils/shipping.js`); a Shiprocket failure never loses an order (the seller sees "book by hand" and the reconcile job keeps retrying). Do not raise either until Rajat reopens them. What each needs when he does:
  - **Shiprocket** — ✅ **UNPARKED 20 Sep 02:04: bank details VERIFIED** (Kotak savings in the KYC name; Shiprocket's ₹1 landed within 40 minutes). COD remittance is open. Left for Rajat (2 min each): OTP-based delivery switch, pickup address nickname = `SHIPROCKET_PICKUP_LOCATION` (env unset → 'Primary'), wallet top-up before launch; then drill L5-L7 with one real parcel. History: ~~the account's COD bank details were refused~~ 20 Sep 01:24: bank details resubmitted in the KYC person's own name (Aadhaar 'Abha' ↔ her Kotak savings) - "under review", Shiprocket penny-drops ₹1 and matches the bank's name.** The two earlier failures were name mismatches (other people's accounts against her Aadhaar KYC). Nobody has GST - not the shop, not the platform - so the GST-KYC route does not exist here. If it still fails: Need Help → chat → manual verify with Aadhaar + passbook photo. Old note kept below. Fix is on Shiprocket's side only: Settings → Company → **KYC** must name the same person/entity as the **bank account** (a current account in the trade name, or KYC in the proprietor's name with a savings account in that name); resubmit; then Settings → Delivery → **OTP-based delivery** on (rulebook ≥ ₹2,000) and the pickup address (the house shop's, phone 8619404837). Code side is done: booking, tracking webhook, reconcile, return pickups, per-seller pickup location exists on the Seller model.
  - **Borzo** — only the **test API** was issued; the live token needs Borzo's business onboarding (company details + first wallet top-up; Rajat asked, no live key yet). When it arrives: Render `BORZO_API_TOKEN` (live) + `BORZO_ENV=production` + `BORZO_PICKUP_*`; the wallet guard (2.45) then decides day by day whether same-day is offered. Nothing else to build.

- ~~**E-Commerce (Amendment) Rules 2026**~~ **built 19 Sep** - `/compliance` (plan §4.45): the 13 named dark patterns with what the site does for each, the two extra duties, and the self-audit certificate read from Settings → Business (audit year · signed on · signed by; "first audit due before 1 Jan 2027" until filled). Left for Rajat in December: walk the checklist as customer/seller/admin, then fill the three fields. Original note: in force 1 January 2027, three months after cutover. New for a marketplace: an annual self-audit against the Dark Patterns Guidelines 2023 with a compliance certificate displayed on the site; no use of consumer data to promote goods sold under a brand common with the marketplace without express consent; no bundled fees for unrelated services; consumers may request further seller details in writing after purchase. Nothing here breaks us today (no dark patterns by design, no own-brand goods, no bundles). Decide in December: who signs the self-audit and where the certificate page lives (a /compliance page, one paragraph + date). Source: SCC Online, 14 Sep 2026.
- **Merchant Center account is named after the house shop and feeds only its products** (`FEED_ALL_SELLERS` off, by design - Google suspends accounts whose name, site and products disagree). Two things link the platform to that shop in Google's eyes: the account name and the feed. Before the first outside seller: rename the account to ShopMaster Pro, apply for the marketplace programme, then `FEED_ALL_SELLERS=true`. Until then Grow's "Your products go to Google Shopping" is true for the house shop only - the card should say "after your first approved products" (small copy fix, queued).

- ~~**GST-registered seller's tax invoice**~~ **built 15 Sep** (`utils/invoice.js`, plan §4.43) - the day a registered seller is approved the system is already right, and nobody unregistered is asked for anything. Research 15 Sep: on a marketplace the SELLER is the supplier and must issue the GST invoice (GSTIN, HSN, tax rate, CGST/SGST per line); the platform's PDF is a customer copy generated on the seller's behalf (Amazon does exactly this). An UNregistered seller may issue only a plain invoice/cash memo - not a 'Bill of Supply' (Rule 49 is for registered composition/exempt suppliers), so the customer bill is titled **Invoice**, per seller, 'Sold by <legal name> · GSTIN or Not registered under GST', issued by ShopMaster Pro on the seller's behalf. Built: every seller has an invoice series (`Seller.invoiceSeq/invoicePrefix` → `MJ/26-27/00042`, Rule 46 shape, issued once when the order is confirmed - COD at placement, prepaid when payment lands - lazily on first open of the bill if that failed; `Order.invoices[]`); `Product.hsn/gstRate` (form shows them to a registered shop only) stamped on every line; a registered seller's document is a **Tax Invoice** with HSN, taxable value, CGST+SGST or IGST by place of supply (delivery state vs GSTIN state), tax taken OUT of the inclusive price; the seller sees their number on the order page. **Left for the day a GST seller actually needs it:** credit note on a return/cancellation (Rule 53), and a monthly CSV of their invoices for GSTR-1. Sources: cleartax GST on online sellers; taxguru Rule 46/49; caclubindia unregistered supplier invoice.


- **The product form's shape: 7-8 chevron cards, and whether a stepper or tabs beats them (Rajat, 26 Sep 2026).**
  *"inme 7-8 cards chevron wale thode noisy feel dete hai... step 1 to step 7,8 aur add ka soch rahe ho to edit ka bhi dekh lena... kya pata ye wali UI/UX jo mai bata raha hu isse bhi badiya UI mil jae."*

  **Not a taste question, and not decided.** Rajat has asked for the full
  method before a yes: web research on what the real merchant tools do +
  reading our own form + the business goal + reasoning, and the answer may
  well be something better than either a stepper or tabs.

  What the answer has to respect, and what makes this harder than it looks:
  - **Add and edit are the same component and must not diverge.** A stepper is
    natural for a first listing and wrong for "change the price" - a seller
    editing one field should not walk seven steps. Shopify and Amazon both
    solve this, differently.
  - The form is already long because the **category templates (2.62)** inject
    per-category questions into "3b · Product facts". Whatever shape is
    chosen has to hold a variable number of fields.
  - The **listing score** and the AI writer read across sections, so a shape
    that hides sections has to keep the score honest and reachable.
  - Mummy fills this **on a phone in Hindi**. Anything that needs precision
    tapping or a wide screen loses.
  - The **same shape probably belongs elsewhere** - Rajat's own point: the
    admin's long screens and Settings could inherit it if it is good.

  Deliverable before any building: 2-3 named options, each with the market
  reference it comes from and what it costs us, and one recommendation.
  **Nothing is built until Rajat picks a letter.**

  **This row was already half-answered when it was written, and nobody closed
  it.** `components/seller/FormRail.jsx` was built the same day (26 Sep) and
  its WHY block holds exactly the reference pass this row asks for - Shopify
  one scrolling page, Amazon tabs and their cost, Material having archived
  the Stepper - and the rail is live in the form with all seven sections and
  a tick each. So the shape question is not open ground; it is "is the rail
  enough".

  **Re-checked against the market on 28 Sep, and the answer held - with two
  findings the first pass missed:**

  - **Etsy does both, split by screen.** Desktop is one scrolling form with a
    jump-nav of seven named sections (their own words: "there are 7 tabs in
    the listing form you must fill out before you can publish", one Publish
    button, Save as Draft beside it). The **mobile app is a real Next/Back
    stepper** over the same data. That is the closest precedent we have to
    Mummy on a phone, and it says the phone may legitimately differ from the
    desktop - which our `foldOnPhone` already half-does.
  - **Baymard's objection to accordions is not noise, it is "what will get
    saved".** Their tested quotes are *"Do I need to save the changes before
    I open another tab?"* and *"will it submit all sections including the
    collapsed ones?"*. Their rule, and this is the actionable one: a
    collapsed step must **collapse into a summary of the entered data**, not
    just its heading - participants "routinely scanned the summaries" rather
    than reopening. **Checked properly on 28 Sep: all seven cards already pass
    a summary and it already shows entered data** - "3 photos - first is the
    main one", "₹275 · 12 in stock", "Gold · Free size". An earlier note here
    claimed only the Category card had one; that was a bad grep (the prop
    sits a line below `<Card id=`), and it is corrected here rather than
    quietly deleted, because a recommendation was built on it.
  - Nobody keeps a completeness score INSIDE the form: Amazon's Listing
    Quality Dashboard is a separate page, Etsy has no score, Shopify has
    Draft/Active and nothing else. Our rail-plus-score is a deliberate
    small-marketplace difference, and the research gives no reason to drop
    it.
  - Amazon's one idea worth stealing: a **Required / All attributes** scope
    switch that re-renders the whole form, which does the add-vs-edit job
    without a second form. Its one warning, from its own sellers: never let a
    field be optional on create and mandatory on edit.

  **So what is actually wrong, read again with the summaries accounted for.**
  `Card` opens `defaultOpen ?? editing`, so:

  - **EDIT**: every card open, and the seller's own open/shut choice
    remembered. Nobody has complained about this half, and the research says
    not to touch it - Shopify's edit page is exactly this.
  - **ADD**: every card SHUT. Seven collapsed rows, and because nothing is
    filled yet, each summary is its empty-state nudge - "No photo yet", "Not
    chosen", "No price · stock?", "Choose a category first". Seven chevrons
    and seven sentences of advice before the seller has done anything. That
    is the screen Rajat called noisy, and summaries are not the fix for it,
    because on this screen they ARE the noise.

  And Baymard's distinction, read properly, names it: they separate the
  **inline** accordion (ad-hoc open/close, no order) from the **sequential**
  accordion (a flow). Inline is the one that tested badly; sequential worked,
  because "users perceive accordion steps as separate pages" and each
  finished step collapses into what was entered. **Our add flow is the inline
  one.**

  **The three options, corrected. Rajat picks a letter.**

  - **A. Make ADD sequential; leave EDIT exactly as it is.** The first card
    opens, the rest stay listed with their summary but inert until the one
    before them is done, and finishing one opens the next. Edit keeps
    today's all-open, remembered, jump-anywhere behaviour. Reuses the rail's
    own per-section `done` test, so the flow and the rail cannot disagree.
    Cost: an inert state on `Fold`, and `Card` has to know whether the
    section before it is done. Backend: no.
  - **B. Just open the first card on add**, leaving the other six shut. One
    line. It tests whether the complaint was only "nothing is open" before
    anything larger is built. Backend: no.
  - **C. Etsy's split**: desktop stays the scrolling page with the rail, the
    phone gets a real Next/Back stepper over the same sections. Closest to
    what Rajat first asked for, and Etsy's own mobile app does exactly this.
    Cost: a second navigation mode to keep honest, and the listing score has
    to stay reachable from every step. Backend: no.

  **Rajat picked A, 28 Sep 2026. Built the same evening.**
  `web/src/lib/formSteps.js` - `currentStep` (the first section not done,
  never an optional one) and `stepStateOf` (done / current / ahead). The
  sections list is hoisted so the rail and the flow read ONE array: a second
  copy is how the rail comes to tick a section the flow still holds the
  seller on. `Fold` takes a `step` prop and follows it; every other Fold on
  the site passes nothing and behaves exactly as before.

  Three things that only showed up in the building:

  - **A card must never close under the seller's hands.** "Done" arrives on
    the keystroke that completes a section - a title is a title at the first
    letter - so the card would shut while they were still typing the
    description. `Fold` refuses to move a section that holds the focus; it
    settles once they have gone elsewhere.
  - **The phone nearly lost the whole thing.** The existing `foldOnPhone`
    logic runs in a microtask, i.e. AFTER the step effect, so on a phone the
    four folding cards opened and shut again. It now stands aside while a
    sequence is running - and the phone is where the sequence matters most.
  - **A section that sets its own `defaultOpen` keeps it.** The FAQs card is
    badged Optional and chose to stay shut; the flow does not overrule a
    section that has said what it wants.

  11 tests on the pure logic (`backend/tests/formSteps.test.mjs`, imported
  across the boundary like validate.js), including the two that would go
  wrong quietly: a gap left behind is not skipped, and the flow never stops
  on an optional section. **Not verified in a browser** - `next build` and
  `next dev` are banned on the laptop (CLAUDE.md), so the first morning's
  look at add-a-product on a phone is Rajat's.

  **B and C stay available**: B (just open the first card) is what A
  supersedes; C (Etsy's real phone stepper) is worth doing if A still feels
  wrong on the phone.

- **The search-word coach: take the seller's OWN word and make it the right one (Rajat, 26 Sep 2026).**
  *"Seller ko pata hota hai product kya hai, lekin self-doubt hota hai - kya yahi acha word hai market me, is word ki kya value hai, chalega ya nahi. Us chakkar me vo ghabra ke kuch nahi likhta."*

  **This is not the AI that fills the words - that exists and is good.** This is
  the opposite direction: the seller types what they already know, however they
  know it (misspelt, Hinglish, Devanagari, a local trade term), and we hand it
  back corrected, with evidence that it is worth having. Their vocabulary is
  knowledge we do not have; today spelling doubt makes them type nothing.

  **Researched 26 Sep. The two big references contradict each other, and the
  contradiction is the design.**
  - **Amazon** tells sellers to put synonyms, abbreviations and *spelling
    variations* into the backend Search Terms field (250 bytes, no commas,
    never repeat title words, refresh every 60-90 days from the Search Term
    Report). Its backend field is a raw index, so a misspelling buys a match.
  - **Etsy** says the opposite: *"It's not necessary to include misspellings -
    Etsy search will redirect shoppers to correct any small typos."* It matches
    on ROOT words (shelf/shelves), wants multi-word phrases, and gives the best
    rule anyone has written down: *"If you can't imagine someone typing a
    phrase into Google, it shouldn't be in your tags."*
  - **We are Etsy, not Amazon**: our own search is Atlas Search with typo and
    prefix tolerance, and Google corrects spelling too. So the feature must
    **replace** the seller's misspelling, never store it alongside. That single
    fact decides the whole behaviour.
  - **Nobody does this.** Flipkart says "use the tools on your dashboard";
    Amazon gives real search volume only to brand owners through Brand
    Analytics. Indian third-party tools (ListIQ and friends) exist precisely
    because sellers must leave the platform to find out if a word is worth
    anything. The big platforms cannot hand-hold millions of sellers. **We have
    three.** This is a small-marketplace advantage, not an oversight of theirs.

  **What "value" can honestly mean here.** Real volume needs Google Ads /
  Keyword Planner - a decision Rajat has not taken. Without it we must not
  print invented numbers. What we CAN say is stronger for a seller anyway,
  because it is their own buyers: Search Console queries that reached this
  shop, our own `SearchLog`, and Merchant Center's "product terms" once there
  is traffic. So the answer reads *"buyers type **jhumka** - seen 12 times in
  searches that reached your shop"*, never *"8,100 a month"*.

  **Shape:** the seller types into Search words as they do now; on Enter, if the
  word is a near-miss of a term we have evidence for, offer the correction with
  the evidence beside it - accept, or keep mine. Never silently rewrite. Also
  worth flagging what Amazon warns about: a word already in the title is wasted
  as a search word.

  **Both decisions taken, 27 Sep 2026.**
  - *(a) Google Ads: yes, open it.* Rajat: "mera manna to ye hai koi faeda free
    ka mil raha le lena chahiye". An account with no campaign and no card costs
    nothing and unlocks Keyword Planner, whose ranges ("100-1K a month") are a
    second, independent source of evidence beside our own searches. It is a
    manual step - it is on his list in OPS-AND-MANUAL-ACTIONS.md.

    **Wired from code, 27 Sep 2026.** Rajat: "koi api services hai kya enable
    karke ya env me dalke waha ka koi kaam yahi manage ho jae." Yes.
    `utils/google/adsAuth.js` + `utils/google/ads.js`, in the same shape as
    `serviceAuth.js` next door: raw fetch, no client library (google-ads-api
    drags in gRPC and protobufs, and `npm install` is banned on the laptop).
    `keywordIdeas()` is the one that matters - it returns India-wide monthly
    volumes for up to 20 seed phrases, which is the "second source" above.
    `accounts()` and `health()` exist so the panel can say what is wrong in
    words. 16 tests, fetch injected, no network.

    Ads authorises a PERSON, not our service account: a personal Gmail cannot
    do domain-wide delegation, so this is the one Google integration on a
    refresh token. Minted 27 Sep with OUR client - the first attempt used the
    OAuth Playground's own client and would have failed with `invalid_grant`
    months later on the box; the error message now says how to re-mint. Token
    refresh proven against Google for real, once.

    **It works. Real volumes, 27 Sep 2026 evening.** The road there was four
    steps, and only the first was obvious:

    1. *Developer token* - from Google Ads -> Admin -> API Center, NOT Cloud
       Console. It came out **Explorer**, which reaches production accounts
       and looked like a gift. The first real call said otherwise:
       `This method is not allowed for use with explorer access.` Google's
       access-levels page names `KeywordPlanIdeaService` by hand in
       Explorer's restricted list. Campaigns and reporting are open;
       planning is not - which is the one thing we came for.
    2. *Brand verification* - a prerequisite for Basic that appears nowhere
       in the docs, only in a grey box on the upgrade page. Everything at
       console.cloud.google.com/auth/branding was already filled except the
       logo; `web/public/brand/mark-192.png` went in and it verified.
    3. *Apply for Basic* - at console.cloud.google.com/google/ads-apis
       **/overview**. Without the `/overview` the page renders zero bytes,
       which cost us an hour of looking for a button that was never on that
       URL. Approved in minutes, not the week I had predicted.
    4. *Link the account* - the manager managed nothing; 525-586-3360 had a
       PENDING invitation that had to be accepted from the child account
       (Admin -> Access and security -> **Managers** tab; `/aw/security/
       managers` is not a URL, the tab lives under `/aw/accountaccess/`).

    First real answer, for a Charming Jewels listing:

        4400  kundan choker set
        3600  bridal kundan jewellery set
        2900  kundan choker
        1600  kundan choker necklace

    That top line is the whole argument for having done this: **"kundan
    choker set" outsells "kundan choker" by 1,500 searches a month**, and
    nothing we own could have told us. Search Console only knows phrases we
    already rank for.

    A free side-effect worth keeping: brand verification also clears the
    "Google hasn't verified this app" warning from the OAuth consent screen,
    which every customer signing in with Google was seeing.

    **Wired into the listing path the same night, and live on the box.**
    The six env vars are on production (`/srv/shopmaster/env/api.env`);
    `ads.health()` answers `connected: true` from inside the api container.

    The numbers do NOT come from a live call. The weekly market-brief job
    pays for them once per category - about thirty operations a week against
    an allowance of 15,000 a day - and stores `monthly` on the word; every
    seller in that category then reads it instantly and free. A form that
    pauses for a second is a form Mummy stops using. Same shape Search
    Console and Merchant Center already use here.

    Two readers, both free: the suggest-words chips (a fourth evidence
    source, ranked below our own Google impressions and our own search box,
    because a large number for a phrase nobody here has typed is a lead and
    not proof), and the listing prompt, whose title rule said "most-searched
    first" and until now had nothing behind it.

    **Running it on the real catalogue found what the tests could not.**
    Seeded with three real ring titles, Keyword Planner's biggest answer was
    "earrings" at 368,000 a month; "Home Decor" came back led by "kitchens
    designs". Stored, those would have outranked every correct word in the
    category. `familySieve` now keeps a phrase only if it shares a WHOLE
    word (crudely stemmed) with the category name or a real product title,
    with colours, metals and who-wears-it struck out of the anchors -
    "Rose Gold Pearl Floral Ring" was otherwise admitting "gold earrings".

    `backfillBriefDemand.js` puts figures on briefs already stored rather
    than waiting for Monday, and repairs an older wound: thirteen briefs
    held ZERO words, built on a day the grounded model was rate-limited.
    All thirty now carry words, 16-20 of each with a number.

    **Left:** the coach itself (this section, above) - taking the seller's
    own word and offering the better one. That is a build, not a setting.
  - *(b) The field does not move; the BUTTON did.* Rajat asked for exactly
    this: "Suggest search words" and the word chips now sit inside 6 · Details,
    in a tinted box directly under the Search words field they write into.
    8 · Google is now purely a read-out - the Google preview and Google's own
    verdicts, nothing to fill. Mummy does not have to relearn where the field
    is, and the two halves are no longer two cards apart. Done, not owed.

  **Most of it shipped 27 Sep.** Plan §4.64 - the seller says or types the
  whole thing in their own language and the model hands it back as corrected
  search phrases, badged ★ and sorted first. Voice is the browser's own
  `SpeechRecognition` at `hi-IN`, free, so **Sarvam (Hindi voice) can stay
  parked**. Plan §4.63 - the field no longer refuses a
  seller's own word at the cap, and a typed word that is a near-miss of a word
  already on the page is offered as a correction. What is left is the part
  that needs a backend: a real lexicon, so a misspelling of a word this
  particular listing has no evidence for is still caught, and the Search
  Console join so the correction can carry "seen 12 times in searches that
  reached your shop".

  ~~**Also open, small:** `components/ui/picker.jsx` is not translated~~
  ✅ 28 Sep 2026 - all fourteen of its own sentences go through `t()` now
  ("Did you mean", "remove one first", "{n} is a good number", the chip and
  Clear labels), with Hindi and Hinglish for each. Callers always passed a
  translated placeholder; what the component wrote itself never followed.

  **Built 28 Sep 2026, and smaller than it looked.** The gate: goal =
  liquidity and seller retention (a listing with no search words is a listing
  nobody finds); the research above already named the reference (Etsy, not
  Amazon - correct the spelling, never store it); what breaks otherwise = the
  field stays empty out of spelling doubt.

  The backend lookup this row asked for turned out to exist already:
  `utils/googleReadiness.js` `keywordEvidence` has joined Search Console,
  `SearchLog`, India-wide demand and the synonym family into one ranked list
  since plan 2.32. What was missing was the MATCHER, and the honest way to
  find out what was wrong with it was to run it against the 600 real phrases
  the weekly job has stored. Two failures, neither guessable from the code:

  - a TRANSPOSITION cost two edits, so "jhumak" for "jhumka" - the commonest
    typo there is - fell outside a six-letter word's budget. Damerau scores
    it one.
  - the briefs hold "earrings" and not "earring", so "earing" was two edits
    from anything written down. Indexing the crude singular beside each word
    fixed it WITHOUT widening the edit budget, and widening the budget is the
    change that starts "correcting" words that were already right.

  Measured on those 600 phrases: **9 of 10 real misspellings corrected,
  including Rajat's own "artifcial", and 0 of 10 correctly-spelt words
  touched.** The second number is the one that matters - missing a
  misspelling costs one word, but telling a seller they are wrong about their
  own trade costs the feature.

  `web/src/lib/searchWordCoach.js` holds it, tested from
  `backend/tests/searchWordCoach.test.mjs` across the boundary (25 tests) -
  the same arrangement as `lib/validate.js`, because a copy would drift.
  Candidates are ranked by which KIND of evidence is behind them, not by
  which number is biggest, and a word somebody wrote beats a stem we derived.
  No evidence means no sentence: `evidenceLine` returns '' rather than
  dressing a zero up.

  **What the headline number does NOT mean, measured properly afterwards.**
  Those 9-of-10 were against the WHOLE 600-phrase lexicon. In the form the
  seller sees one category's words, and `marketBrief.js:74` keeps only the
  **top 20 per brief** - so each of those misspellings is corrected in
  exactly ONE of the thirty categories: the right one. That is the correct
  behaviour (a seller listing a power bank should not be offered "jhumka"),
  but it means coverage is thin, and **the lever is the cap, not the
  matcher**. `categoryWords` already asks for 40 and the writer stores 20 -
  the reader is willing to take twice what the writer keeps. Raising
  `.slice(0, 20)` costs nothing (the Ads call for that category has already
  been paid for) and roughly doubles what the coach can catch. Not changed
  unattended: it changes what every seller sees in the suggestions, and it
  only takes effect when the weekly job next runs.

  **Also still open, and it waits on traffic rather than on code:** the
  correction can only say "seen 12 times in searches that reached your shop"
  once Search Console has queries for this shop to join, and today it has
  almost none. `keywordEvidence` already reaches those rows the moment they exist;
  what is not built is a free per-form endpoint to carry them into the field
  before the seller presses the AI button. Worth building when there is
  traffic to put in it, and not before - an evidence line with nothing behind
  it is the invented confidence this feature exists to remove.

### 3b. A page per product: "how is this listing doing" (Rajat's idea, 27 Sep 2026)

*"Mai soch raha tha ek about page ho seller ke paas bhi product ka, jisme bare
hue product ki report - preview aur score ya fix aur aur bhi. Product ki exact
info to edit mode me dikh jati hai, usko chhod ke. Jaise ye jahan score dikh
raha hai isko clickable page bana de."*

**Researched 27 Sep. The idea is sound, and one big platform does exactly it.**

- **Everyone separates "edit the listing" from "how the listing is doing".**
  That part is unanimous, and it is why *8 · Google* had to come out of the
  form (plan §4.61).
- **Where the report lives splits by seller size, and that is the useful part:**
  - **Etsy - the closest reference we have**, because their sellers are Mummy
    and Rahul, not enterprises: a **per-listing Stats view**. You open the
    listing itself, not the shop-level Stats page, and scroll to **Traffic
    Sources**, which splits the visits by Etsy search, direct, social and Etsy
    ads - alongside views, visits, favourites, orders and revenue. This is
    Rajat's about page, and it already exists on the platform whose sellers
    most resemble ours.
  - **eBay** attaches per-listing prompts ("Opportunities", formerly "Sell it
    faster") to the rows of the listings table rather than giving each listing
    a page.
  - **Amazon** has no per-ASIN page at all - per-ASIN **rows** inside
    account-level dashboards (Listing Quality Dashboard, Detail Page Sales and
    Traffic by ASIN). At millions of ASINs a page each would be useless.
  - **Shopify** has nothing per product; product analytics lives in Analytics
    and Reports, away from the product entirely.
- **So a page per product is a SMALL-marketplace pattern.** It is cheap for us
  and impossible for Amazon, and that is the same shape of advantage as the
  search-word coach in §3. We have three sellers.

**What we could put on it today, without new data:** the listing score and all
its fixes (`lib/listingScore`, already shared with the server) · the Google
result preview · Google's own verdicts from `/seller/products/:id/google` -
indexed and last crawl, Merchant Center status and issues, Shopping
impressions and clicks over 28 days, and the Search Console queries that
reached the page · orders and units for this product · its stock history ·
its photos and what the AI did to them.

**The one thing missing, and it is the thing Etsy's page is mostly made of:
on-site views.** Nothing counts a view of a product page today - there is no
field on `Product`, no `ProductView` model, and GA4 is client-side and not
queried by us. So either the page launches honest ("Google showed it 34 times;
we do not yet count visits here"), or a small view counter goes in first. The
counter is the better answer and it is cheap: it also feeds the "buyers type"
evidence the search-word coach needs.

**Gate.** Goal: **seller recruitment and retention** - Etsy's whole
seller-retention loop runs on a seller being able to see what a listing earns
them. What breaks without it: nothing today, but the read-outs have no proper
home, so they keep being pushed into a form that should only hold work.

**Shape to build:** `/seller/products/[id]/report`, reached from the score
block in the edit form (making the score clickable, as Rajat asked) and from
the row in All products. Edit stays the place for exact product info; the
report page holds everything about it. One backend aggregation endpoint, plus
the view counter.

**BUILT 27 Sep 2026** (Rajat: *"hnn dekh lo bana lo"*). `/seller/products/[id]/report`
carries sold · earned · page opened · stock left, the score with every fix as
a link into the editor, the Google preview, and the rewritten Google status.
The view counter went in first, as a browser beacon rather than a server-side
increment - the server-side version counted cache misses, not visitors. Plan
§4.62.

**The three that were still open are done, 28 Sep 2026** - all of them the
parts of Etsy's Stats the page was missing:

- **A trend line for views.** `summariseViews` now returns `daily`, one point
  for every day in the window INCLUDING the empty ones, drawn as a single
  `<polyline>` in the page (no chart library: twenty-eight numbers are not
  worth a download on Jaipur mobile data). The scale starts at zero, because
  a line that rescales to its own minimum makes three views look like a good
  week. Tested for the shape, not just the totals - two spikes with a quiet
  week between them must not read as a flat line.
- **Where the visit came from** (Etsy's Traffic Sources, the part a seller can
  act on). `ProductView.sources` holds five named counts - direct · site ·
  search · social · other. `ViewPing` works out the bucket **in the browser**
  from `document.referrer` and sends only the word, so the referring address
  never reaches our database or our logs and there is nothing to scrub later;
  the server takes it through an allow-list, so a crafted body can add noise
  to one number and can never write a string. Views counted before today have
  a total and no split, and the page SAYS so ("of 40 visits, 12 are split
  here") rather than drawing the rest as direct.
- **Favourites.** A count of people, not of rows - one wishlist document per
  shopper - with an index on `items.productId` so it does not walk every list.
  It is the number that explains views without sales: saved eleven times and
  never bought is a price, not a photograph.

**Still open, none of it blocking:** the split needs real traffic before it
says anything (every row before 28 Sep has a total and no buckets), and a
WhatsApp forward usually arrives with no referrer at all, so it lands in
`direct` rather than `social` - worth revisiting only if the numbers look
wrong once there is traffic to look at.

### 3c. "Semantic chunking and Google's OKF are much better than RAG" - researched, and mostly not true (27 Sep 2026)

Rajat, going to bed: *"Mai aajkal bahut logo se sun raha hu RAG se zyada
semantic chunking aur naya Google ka OKF RAG se bahut better hai - iske baare
me research karna, deeply sochna, fir apne ko kitna fayda hoga us hisaab se
laga dena."*

**OKF is Google's Open Knowledge Format** (v0.1, June 2026): knowledge as
human-readable Markdown concept files with YAML frontmatter and explicit links
between concepts, traversed deterministically instead of by nearest-neighbour
search. Portable, git-native, diff-able - genuinely nice properties.

**The one controlled evaluation says it does not retrieve better.** Abhinav,
*Does Google's Open Knowledge Format Improve RAG?* (SSRN 7227678, Aug 2026):
a 623-page wildfire-mitigation filing, 93 questions, page-level answer keys.

| What was measured | Page hit |
|---|---|
| OKF lexical retriever | 91.1% |
| Dense-vector baseline | 65.8% |
| **Plain BM25 over ordinary chunks, no OKF** | **97.5%** |

The apparent OKF win vanished under inspection: the dense encoder read only
**256 word-piece tokens** while **80.9% of passages were longer** - it was
being fed truncated text. A proper OKF bundle (1,011 concepts, 99.9% of the
source words) still did not beat ordinary chunk retrieval, and bolted onto a
strong hybrid pipeline it **added nothing**. The author's own conclusion: OKF
looks like an improvement when the baseline is weak.

**Semantic chunking: three independent evaluations say no.** arXiv 2607.01852
- "cluster-based semantic chunking did not yield any consistent improvement
with the implemented configuration and adds computing complexity". Vectara -
"failed to show a clear advantage in identifying evidence sentences across
datasets". Chroma's benchmark puts plain recursive chunking at the top.

**What this means for us specifically.**
- We do **not** have the bug that made the study's baseline look weak. Our
  chunks cap at 1,800 characters and `utils/ai/embed.js` sends up to 8,000 to
  `gemini-embedding-001`. Nothing is truncated. Checked, not assumed.
- We already do **structural chunking** - `indexKnowledge.js` splits markdown
  on headings, then paragraphs, then lines. That is the thing semantic
  chunking approximates, except ours is exact, because a person wrote the
  headings.
- So: **OKF, no. Semantic chunking, no.** Neither would pay for the work.

**What the research DID pay for, and is now built.** The finding that matters
is not about OKF at all: a plain lexical retriever beat a dense one outright
on real documents. We had a MongoDB text index sitting on the same chunks and
were using it **only as a fallback for when embedding failed**. It is now a
peer: `utils/ai/retrieve.js` runs both roads together and fuses the rankings
with Reciprocal Rank Fusion (k=60, the Cormack constant), capped at three
chunks per file so one long file cannot take every slot.

**Measured on the live index (459 chunks), not claimed:**
- *"what commission do I pay"* - vector alone missed `payout.js`,
  `priceOrder.js`, `Earnings.jsx`, `OrderDetail.jsx`. Those are the files that
  answer what a seller is actually paid.
- *"how do returns work"* - vector returned generic pages; the text road found
  `OrderDetail.jsx` and `ShipmentTimeline.jsx`.
- *"Shiprocket se booking kaise hoti hai"* - the per-file cap freed slots and
  surfaced `bookingFailure.js`, which answers the half of the question the
  booking file does not.

Cost: nothing. No new service, no new index, no extra AI call - the embedding
already happened, and the text index already existed. 9 tests on the fusion
(`tests/rankFuse.test.mjs`); it is pure, and its failure mode is silent, which
is the worst kind: the assistant keeps answering fluently from slightly worse
evidence and nobody ever sees a bug.

**Still open, if we ever want more:** a cross-encoder reranker over the fused
top 20. That is the third leg of the "strong hybrid pipeline" the study used,
and it is the only remaining idea with evidence behind it. It needs a rerank
model call per question, so it is a cost decision, not a code decision.

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
| A1 | **Speech → text (Hindi/Hinglish)** | Groq Whisper v3 turbo; Gemini audio as fallback | Mic in Ask ShopMaster (the shopkeeper asks by voice), mic in the customer search bar (Flipkart/Meesho pattern), **"bol ke listing"** — seller speaks name/material/price, the form fills | seller ease · liquidity | **Build first** |
| A2 | Text → speech | Browser `speechSynthesis` (Hindi voice, zero API) first; Gemini TTS preview later | Assistant reads its answer aloud | seller ease | With A1, browser-only |
| A3 | **Moderation, own policy** | Groq gpt-oss-safeguard-20b | Reviews, dispute text, seller About/links, coupon names → flag abuse, phone numbers, off-platform deals → admin weekend queue, auto-hold | trust · weekend admin | Build small |
| A4 | **Embeddings → similar products + Hinglish search** | Gemini embeddings (have) + 3rd Atlas vector slot | "Aapko ye bhi pasand aayega", jhumka⇄earrings⇄झुमका, typo-proof search | liquidity | Build |
| A5 | Review highlights ("Customers say") | Gemini text, cached per product | Needs ≥5 reviews/product | trust | Later, at volume |
| A6 | Photo search (upload → find) | Gemini vision → text → search | Flipkart has it; our catalogue is small | liquidity | Later |
| A7 | Real-time voice agent (Gemini Live), video/music gen, OCR invoices, demand forecasting | — | No goal served now | — | No |

Assistant gaps found in the same pass (problem taxonomy in the chat of 13 Sep): suspended seller cannot reach the assistant (`requireApprovedSeller`) though they need it most; no `myPayments` (Razorpay attempt/refund status) tool; no `checkCoupon` tool; admin lacks `disputeBrief` and `customerRisk` tools; payouts-vs-Razorpay-settlement reconciliation is unseen by anyone. Each is a half-day; none started without a yes.

## 4. Ideas raised, not decided — do not start without a yes

- **`sendEmail` writes customer email addresses into the container logs** (found in the 30 Sep full read). [utils/sendEmail.js:101](backend/utils/sendEmail.js#L101) is `console.log('Email sent:', to)`, and those lines sit in Docker's log on the box for as long as it keeps them. Nothing else in the sweep leaks: the Razorpay webhook log prints only the event NAME (`parsed?.event`, e.g. `payment.captured`), not the payload, and the order-created log prints ids. One line to fix - drop `to`, or mask it - and it is worth doing because this project already argues DPDP and the Consumer Protection Rules at people on its own policy pages. **Not started:** nothing breaks today, and it should go in with whatever else touches that file. Two of the six untested utils are `sendSafeEmail` and `tokenUtils`, which is the same neighbourhood.
- **Six utils are never mentioned by any test** (30 Sep): `appUrl`, `notifyCustomer`, `productVectors`, `sendSafeEmail`, `tokenUtils`, `webRevalidate` - 6 of 79, so 92% are at least touched. `tokenUtils` and `sendSafeEmail` are the two worth a test; the rest are thin wrappers.
- **The product list sends five times what a card reads** (measured 30 Sep 2026, live). `/api/public/products?limit=24` returns whole documents — 48 fields — where the grid uses 13. **75,025 bytes served, 14,450 needed: 80% waste.** The heaviest passengers are `description` (13.9 KB, 22% — full copy for a grid that prints none), **`aiFilled` (12.0 KB, 19%)**, `highlights`, `tags`, `attributes` and `video` (14.8 KB together). Also riding along: `isDeleted`, `__v`, `status`, `templateKey`, `variantGroupId`, `sku`, `hsn`, `gstRate`. Nothing here is a money secret — the model has no cost or margin field, and `vector`/`vectorHash` are already `select: false`, which was deliberate. Two reasons it is still worth a decision: the audience is a phone on mobile data in Jaipur, and **`aiFilled` publishes which parts of each product an AI wrote** — not a leak, but not something the shop would choose to announce either. The fix is one `.select()` on `listProducts`, and the risk is that something downstream reads a field the grid does not — which is why it is a decision and not a patch. **Not started:** the gate says nothing breaks today, and reviews (A0.2) and the seller catalogue are bigger levers at 50 products and single-digit orders a day.
- Google Cloud extras (Always-Free page read 13 Sep: docs.cloud.google.com/free/docs/free-cloud-features), each gated on a real need appearing: **Web Risk** (100k URI checks/month) to screen links sellers paste (website, video) once unknown sellers join · **Cloud Run** (2M req/month) as the hosting fallback if Render's paid tier bites after cutover · Vision SafeSearch to auto-moderate seller photos (1k/month free) when unknown sellers join · Speech-to-Text (60 min/month) or Groq Whisper for voice listing · Sheets API order export for the CA · Web push (FCM) for "shipped" · Google Wallet loyalty pass · photo-to-search via Gemini vision + Atlas Search.
- Search by embeddings (Atlas Search now covers typos/prefix; embeddings only if semantic misses show up).
- Voice input for the AI listing (Groq or Cloudflare Whisper).
- Text fallback when Gemini's quota is out — Pollinations serves free text models (`gpt-5.4-nano`, `deepseek-v4-flash-vision`, `glm-5.3-flash`).
- Real 3D product views (Tripo3D) — "3D later" was Rajat's phrase.
- A 3D / motion-led home concept (raised 20 Sep, launch day, home empty of products). Gate: no reference marketplace at our stage does it (Amazon/Flipkart/Myntra/Meesho heroes are photo + offer); it costs on a mid-range phone on mobile data and adds no trust. What the empty home actually needs is the first 20-30 real listings with clean photos. Revisit only after the catalogue exists, via `imagegen-frontend-web` references and a Lighthouse budget.
- The `/sell` recruitment page rebuilt with `taste-skill`'s dials against `web/DESIGN.md`; a brand board from `brandkit`.
- Re-run the logged-out marketplace navigation research that a session limit cut off (plan §15).
- **Import a whole variant family** (26 Sep): Amazon gives every colour its own ASIN and its own URL, so one import is one variant - correct as it stands. The offer that could follow: after an import, "this listing has nine more colours - bring them in as one product with colour options?", using `variantGroupId`. Not started; worth it only once a seller with a real variant catalogue joins.
- The admin's own long dropdowns (Coupons, Categories, Assist logs) could take the seller form's `ui/picker` too (24 Sep). Not done on purpose: it is Rajat's weekend screen on a laptop with a keyboard, so nothing is being lost today.
- **Three more ways to ground the listing, found while researching the Ads
  API (27 Sep 2026).** None started - Rajat asked for "everything that helps
  fill the product", and these are the honest remainder after the ones that
  were built. Each is free and each is gated on a real need:
  - *Google's image rules, checked before upload.* Google publishes minimum
    dimensions, no watermark, no promotional text. We check none of it, so a
    photo can be rejected in Merchant Center days after the listing goes up.
    A local check, no API. Gate: it only pays once sellers who are not
    Mummy are uploading - she is shown her photos on the page anyway.
  - *Google's required attributes per product category.* Their taxonomy says
    which attributes matter for which category; our `listingTemplates` are
    ours, written by hand. Joining the two would make the score honest about
    what Google actually withholds ranking for. Gate: the existing templates
    have not yet been shown to be wrong.
  - *Merchant Center price competitiveness* (`utils/google/marketInsights`)
    is already coded and answers "not yet enabled by Google" - it switches
    on by itself once there is traffic. Nothing to build; just do not forget
    it exists.
- **Fine-tuning our own model — checked and closed (27 Sep 2026).** Rajat
  asked twice, so this is written down rather than re-argued each time.
  Gemini tuning needs billing and Google Cloud refuses his card. Cloudflare
  only SERVES a LoRA, and its base models (Gemma 2B/7B, Llama 2 7B, Mistral
  7B) are weaker than the Llama 3.3 70B already on our free fallback chain -
  it would cost money to make the output worse, and would narrow five roads
  to one. Shopify does fine-tune for this exact domain, but for category and
  attribute CLASSIFICATION at tens of millions of predictions a day, where a
  small owned model is cheaper than a large one; that is a cost argument at
  a scale we do not have. Our problem is invented facts, and the answer to
  that is grounding. What a tune would have bought - house style - was built
  instead as two of our own listings in the prompt. Reopen only if we are
  ever making millions of calls a month.

## 6. Live drill — what only the real world can answer

Written 20 Sep 2026 after the first live ₹1 payment found three things 1223
green tests could not (list 2.49). Tests mock the boundary; the mock says
yes. Each row below is a scenario a mock has answered for and a real call has
not. Done = the scenario was run for real, the result read on all three sides
(customer / seller / admin), and the row struck through with the date. Most
cost ₹1 or nothing. Rajat runs the human step; Claude reads the API, mails and
records the same night.

| # | Boundary | Scenario (₹1 or free) | Who | Done |
|---|---|---|---|---|
| L1 | Razorpay webhook | ~~Pay ₹1 against the live API (new web on localhost, `NEXT_PUBLIC_API_URL` → Render), close the tab before the success page~~ ✅ 20 Sep 00:47 - SMP-260919-CB0E74 confirmed by the webhook alone (`razorpaySignature: 'webhook'`, 85 s after checkout), cart cleared, invoice CJ/26-27/00006, mail in Inbox 12:47. Found on the way: the /api proxy forwarded the browser's Origin and the live API refused localhost → `proxy.js` drops Origin on the proxied hop outside production | Rajat ₹1, Claude reads | ✅ |
| L2 | Razorpay webhook | ~~Cancel a paid live order once the balance exists - `refund.processed` must move `queued/processing` → `completed`~~ ✅ 20 Sep 02:32 IST, on its own: the two-hourly `refunds` job raised `rfnd_Te2KmniHUjchk1` for SMP-260919-51B963, Razorpay's `refund.processed` webhook reached Render and the order reads `completed`, `paymentStatus: refunded`. Nobody touched anything | after L1 settles | ✅ |
| L3 | Razorpay | ~~Abandon at the UPI screen: the reservation must release in the timeout, stock back~~ ✅ 20 Sep 00:50 - SMP-260919-CB0EC3 held → released at expiry (01:05), reserved 1 → 0. **Found a real hole:** the product page subtracts `reserved` and the COD path checked stock−reserved, but only a NEW prepaid reservation swept expired holds - so an abandoned UPI on the last unit read "Out of stock" for everyone, forever (nobody could add it to a bag to trigger the sweep). Now the product page and the COD path sweep that product first, and the two-hourly job sweeps all (`reservation.releaseAllExpired`) | Rajat | ✅ |
| L4 | Refund queue | ~~The 19 Sep ₹1 (SMP-260919-51B963) leaves the queue by itself when the balance settles; customer gets the "refund started" mail~~ ✅ 20 Sep 02:32 - queued 23:53 → raised by the job at 02:32 → completed by webhook; 'Refund of ₹1 started' mail + bell sent (Rajat: check Abha's Gmail) | wait + Claude | ✅ |
| L5 | Shiprocket | ~~One real parcel to Rajat's own address~~ ✅ already done for real on 6 Sep from the old app (SMP-260906-858D34: booked → tracked → delivered; same API, same Shiprocket code path; only `billing_address_2` added since). Not repeated on purpose (Rajat, 20 Sep) | — | ✅ 6 Sep |
| L6 | Shiprocket | NDR on purpose (refuse the parcel once) → NDR bell, re-attempt, RTO path | with L5 | ☐ |
| L7 | Shiprocket | Return pickup with QC photo, cancel a booking before pickup | with L5 | ☐ |
| L8 | Brevo mail | ~~Open Abha's Gmail~~ ✅ 20 Sep - both order-confirmed mails in **Inbox** (not spam), render cleanly on the phone in dark mode, sender "ShopMaster…", amounts/buttons right | Rajat | ✅ |
| L9 | OTP mail | Seller sign-in on a new phone: how many seconds until the code arrives; resend cooldown | Rajat | ☐ |
| L10 | Web push | Seller on Android Chrome: allow → one order → notification with sound; iPhone only after Add to Home Screen | Rajat / Mummy | ☐ |
| L11 | Phone browser | Product form from the phone camera: HEIC + 12 MB photo, voice input, invoice print/PDF, return tag print | Mummy's phone | ☐ |
| L12 | Sessions | Two devices for a week: silent refresh after the hour, "log out everywhere" from one ends the other | Rajat | ☐ |
| L13 | Cookie bar + tags | On the live domain: bar shows once, "Accept all" → `_ga` set, GA real-time shows the visit; Pixel when the ID exists; "Only necessary" → no `_ga` | Rajat, Claude reads GA | ☐ |
| L14 | Google | After cutover: Merchant feed fetched, Search Console indexes the Next pages, GBP link | week 1 after cutover | ☐ |
| L15 | Actions cron | One morning: low-stock 09:00 IST, growth note Monday 09:05, refunds job every 2 h - times right in IST | Claude reads the run log | ☐ |
| L16 | Time | 1 April 2027: invoice numbers restart at 00001 under FY 27-28 | calendar | ☐ |
| L17 | Backup | Restore the Sunday backup into a scratch database once, following the header steps | Rajat + Claude | ☐ |

## 5. After cutover only

- **Cutover ran 20 Sep 2026** (AWS Lightsail Mumbai; OPS has the facts and the short close-out list). The Render static site stays until the box has run a week; then delete it and `frontend/` (§1 must be empty).
- **Home merchandising workspace + motion (Option A)** — **S1 ✅ 21 Sep 10:00**: `home.sections[]` (hero fixed · category tiles · product row by hand-picked slugs or a /shop link · shops · banner · just-added with a minimum), `backend/utils/homeSections` normaliser (tests), Settings → Home page → **Sections** editor (add / up-down / switch / fields; the old featured strip folds in as the first product row), `components/home/Sections` server-rendered; checked at 1440 and 390 on dev data. **S2 ✅ 22 Sep 08:05:** pickers (categories ticked from the tree, fullest first; products searched by name via suggest → chips with photo; shops ticked from the seller list; "Paste slugs instead" kept) + a phone-width **live preview** beside the list that redraws on every change before Save. **S3 ✅** = E3 in 2.65. **S4 ✅ 22 Sep 08:05:** section type `reviews` ("What customers say": count 3-8, stars floor; `GET /reviews/recent` - real words, live product with photo, buyer as first name + initial; hidden until three). **Left from S4:** the launch-banner request flow (a seller asks for a banner slot) - C-list. Original note: - `home.sections[]` on the Shopify theme-editor pattern (hero with two arch-card products, category tiles ≤ 8, hand-picked collections, featured sellers, announcement/launch slot, recent reviews, "new this week" only at ≥ 8), admin editor with live preview, empty states for a thin catalogue, motion on transform/opacity only with a Lighthouse ≥ 85 gate. References and numbers in the 20 Sep chat: Baymard 2025 homepage, Etsy home modules, Dawn sections, web.dev CWV. Sequence S1 backend + editor → S2 render + empty states → S3 motion → S4 sellers/reviews. Seller-requested launch banners (C) after 3+ sellers.
- Delete `frontend/` a week after the domain moves (plan §13a, OPS cutover list).
- Key rotation, test-data deletion, branding polish — the deferred cleanup.
- Old Studio results made before `AiDraft` existed are not in the drafts strip; nothing to do unless he misses one.
- **Launch video** - the whole free plan (script → Remotion scenes from screenshots → OBS flows → 3–4 AI mood clips → own voice → ElevenMusic → Resolve) is in `LAUNCH-VIDEO.md`; open it once the UI has stopped moving. Claude's part: the Remotion scaffold and the script.

---

*When something here is finished, delete the row and add a line to plan §13 or
the OPS changelog. When something new is decided, add it here the same day.*
