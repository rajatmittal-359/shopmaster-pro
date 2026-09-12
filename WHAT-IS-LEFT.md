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
construction, the label was already honest.**

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
| 2.2 | **NDR / failed delivery has no screen.** `ndrReason` is recorded by the webhook; nothing shows it to the seller or admin | OPS backlog | — |
| 2.3 | **POD and NPR evidence on the admin dispute screen.** `podUrl` and `nprReason` are stored; the referee cannot see them | OPS backlog | — |
| 2.4 | **No return label is ever produced.** Nothing calls Shiprocket's label endpoint; the customer is told nothing about what to attach. Also why Merchant Center's "return label" field is unanswered | OPS backlog | — |
| 2.5 | **Seller cancellation carries no penalty** (Amazon 2–10 %, Flipkart ₹60) | OPS backlog | A policy number from Rajat |
| 2.6 | **35 seeded products still share the old description.** `node draftProductDescriptions.js --apply` on a day with Gemini quota. None reach the feed, so nothing customer-facing waits on it | OPS backlog | Quota |
| 2.7 | **The remaining panel pages to the product-form standard** — seller Earnings, Stock history, Products list, Order detail; admin Overview, Orders, Sellers, Payouts, Categories, Coupons, Inventory. All work; all still the first-pass style. Dashboard/Orders/Settings were done 12 Sep (plan §4.19) | Plan §4.19 | Time |
| 2.8 | **NVIDIA provider** — keep as a generate-only fallback, or remove. Text-to-image only (cannot take our photo), one-time credits | This session | Rajat's call |
| 2.9 | **Sentry** — the one blind spot: a 500 at checkout is invisible | Plan §7b | Rajat's DSN |
| 2.10 | **Backend hardening the copy-paste era never had:** no `helmet`, **no rate limiting** on login / forgot-password / checkout / AI routes, no request-validation layer (controllers validate by hand, unevenly). Found 12 Sep while measuring the backend | This session | Rajat runs the installs (`helmet`, `express-rate-limit`) — then I wire them with tests |
| 2.11 | **`productRoutes.js` carries 403 lines of business logic** — the one structural leftover from the 5 Sep review. Move to a `productController`; behaviour unchanged, tests already cover it | `docs/archive/CODE-STRUCTURE-REVIEW.md` item 1 | Time |

## 3. Rajat's call — researched, waiting on a decision

- **Seller performance / RTO rate page.** Meesho demotes on RTO; Amazon has Account Health. We have the data. Now, with three sellers, or at thirty? (Plan §14.2)
- **Buyer-protection line on the product page.** Needs the copy — what we actually promise. (Plan §13)
- **Buyer–seller messaging.** Large. Later. (Plan §13)
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
