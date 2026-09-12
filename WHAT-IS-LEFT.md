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

## 2b. Google visibility — the full list, decided 12 Sep 2026

Rajat: *"Google pe product har factor me win kare… sab chahiye jo free me
available ho; manual jo bologe kar lunga."* Goal: liquidity (product pages
found and clicked) and trust (reviews, honest listing data). Today's truth
from Search Console: 90 days, 7 queries, all the brand name misspelt, no
product word; 2 pages indexed, 8 not.

| # | What | Free? | Rajat does | Claude builds | State |
|---|---|---|---|---|---|
| G1 | Search Console API — what people typed, per page, position | ✅ | done (service account is a user) | admin card ✅; seller: per-product queries in the listing panel | admin ✅ · seller ☐ |
| G2 | URL Inspection API — is each product page indexed, last crawl | ✅ same account | — | "Google indexed: yes/no" per product; admin list of not-indexed | ☐ |
| G3 | Merchant Center API — per-product approved / disapproved + reason | ✅ verified (17 approved) | done | seller sees Google's verdict on the product; admin sees all | ☐ |
| G4 | Product structured data for merchant listings — `OfferShippingDetails`, `MerchantReturnPolicy` (7 days), `aggregateRating` where reviews exist | ✅ code | — | JSON-LD on the product page | ☐ |
| G5 | Listing quality panel — score, checklist (title/photos/colour/size/description), AI keywords, Google preview, G1–G3 data inline | ✅ (Gemini/nano) | — | product form | ☐ **now** |
| G6 | GA4 property + Data API — traffic, product views, add-to-cart funnel | ✅ | **create GA4 property, send Measurement ID** | events on the storefront; admin panel card | ☐ |
| G7 | PageSpeed Insights API — Core Web Vitals per page | ✅ | **Cloud → Credentials → Create API key → send** | admin card, per-page warnings | ☐ |
| G8 | Google Business Profile — reviews, products, posts (local pack, "near me") | ✅ | **reviews 2→30, add products, one post a week** (no API for small accounts) | `sameAs` (Instagram, Justdial, GBP) in Organization schema — send the URLs | ☐ |
| G9 | Merchant promotions feed — coupons shown in Shopping results | ✅ | — | coupons → promotions feed | ☐ later |
| G10 | Cutover — the React app is why 8 pages are not indexed (client-rendered); Next renders them | — | October, Render card | already built | ☐ Oct |
| — | Keyword Planner / Trends volume | needs Ads account + approval | not now | — | dropped |

**First-run tour, per role** (customer · seller · admin): 3 coach marks on the
first visit, dismissible, remembered per role. Shopify's first-visit tooltips.
Small, after G5. ☐

**Our own site search** (customer side): MongoDB **Atlas Search** — free on
the current cluster, no new account: typo tolerance (jhumki/jhumka/झुमका),
synonyms, autocomplete, relevance. Replaces the regex suggest; Gemini as an
optional layer on top ("laal jhumka 500 ke andar" → filters). Via `/database`.
☐

## 3. Rajat's call — researched, waiting on a decision

- **Seller performance / RTO rate page.** The first piece exists (cancel rate on the dashboard and the admin list, plan §4.26); late-dispatch and RTO counts would join it the same way. Now, or at thirty sellers? (Plan §14.2)
- **Buyer-protection line on the product page.** Needs the copy — what we actually promise. (Plan §13)
- **Buyer–seller messaging.** Large. Later. (Plan §13)
- **Return label generation** — dropped as a need: in India the reverse-pickup rider brings the label (Amazon, Flipkart, Delhivery); the customer's page now says so. Revisit only if a courier asks the customer to print.
- **Request-validation layer** (Zod/Joi) — controllers validate by hand today; add when a second pair of hands starts writing endpoints.
- **Direct-to-Cloudinary uploads** once 7 MB video clips stop being enough — needs an unsigned upload preset in the Cloudinary console. (OPS backlog)

## 4. Ideas raised, not decided — do not start without a yes

- Search by embeddings (the current suggest is word-boundary regex).
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
