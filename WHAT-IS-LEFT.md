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

Found by diffing `frontend/` against `web/` on 12 Sep. These are regressions,
so they come first.

| # | What | Where it was | Size |
|---|---|---|---|
| 1.1 | **Product video.** The React seller form uploaded one clip per product (base64, 7 MB cap) and the product page played it. `Product.video` is still in the model; `web/` has no upload and no player | `frontend/src/pages/seller/MyProductsPage.jsx`, `ProductDetailsPage.jsx` | Medium — a slot in `MediaManager`, a player in the gallery |
| 1.2 | **Why an order was cancelled.** `cancelledBy` and `cancellationReason` are stored and the React customer order page showed them; the Next one does not | `frontend/src/pages/customer/OrderDetailsPage.jsx:96` | Small |

## 2. Decided, not finished

| # | What | Decided where | Blocked on |
|---|---|---|---|
| 2.1 | **Verified-purchase badge** on reviews — set when the reviewer has a delivered order with that product; show it | Plan §13 "Owed on the product page" | Rajat's yes (OPS "Questions" Q3 was never answered) |
| 2.2 | **NDR / failed delivery has no screen.** `ndrReason` is recorded by the webhook; nothing shows it to the seller or admin | OPS backlog | — |
| 2.3 | **POD and NPR evidence on the admin dispute screen.** `podUrl` and `nprReason` are stored; the referee cannot see them | OPS backlog | — |
| 2.4 | **No return label is ever produced.** Nothing calls Shiprocket's label endpoint; the customer is told nothing about what to attach. Also why Merchant Center's "return label" field is unanswered | OPS backlog | — |
| 2.5 | **Seller cancellation carries no penalty** (Amazon 2–10 %, Flipkart ₹60) | OPS backlog | A policy number from Rajat |
| 2.6 | **35 seeded products still share the old description.** `node draftProductDescriptions.js --apply` on a day with Gemini quota. None reach the feed, so nothing customer-facing waits on it | OPS backlog | Quota |
| 2.7 | **The remaining panel pages to the product-form standard** — seller Earnings, Stock history, Products list, Order detail; admin Overview, Orders, Sellers, Payouts, Categories, Coupons, Inventory. All work; all still the first-pass style. Dashboard/Orders/Settings were done 12 Sep (plan §4.19) | Plan §4.19 | Time |
| 2.8 | **NVIDIA provider** — keep as a generate-only fallback, or remove. Text-to-image only (cannot take our photo), one-time credits | This session | Rajat's call |
| 2.9 | **Sentry** — the one blind spot: a 500 at checkout is invisible | Plan §7b | Rajat's DSN |

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
