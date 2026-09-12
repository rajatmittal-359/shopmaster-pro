# ShopMaster Pro — backend rules (read by the `/backend` skill)

## Goals the gate checks against
Liquidity · Trust · Seller recruitment · October 2026 cutover with nothing the React app could do missing (`WHAT-IS-LEFT.md` §1). Stage: three sellers, ~50 products, single-digit orders a day, one Render instance (Singapore), cron on Render.

## House rules (from the code's own WHY blocks) — these outrank the generic checklist

1. **The server decides, the page draws.** Every button's existence is a flag
   the API sent (`canCancel`, `cancellableItemIds`, `canDispute`,
   `canDeclareDelivered`). The flag and the endpoint use the **same helper**,
   so they cannot disagree (`canCancelOrder`, `customerMayDispute`).
2. **The party with money at stake does not record the fact.** A seller does
   not mark their own parcel delivered and release their own payout; the
   courier scan or the customer does. COD "paid" is not the seller's word.
3. **Money is per seller, never per basket.** `sellerMoneyFor` — subtotal,
   commission as stamped at sale, earning. Never `order.totalAmount` to a seller.
4. **Nothing refunds immediately.** A return refunds when the goods are
   received; a dispute stops the payout and waits for an admin; a cancel
   refunds through Razorpay and records the refund id. Money that has left
   cannot be brought back.
5. **Stock: reserved is not consumed.** A prepaid order holds units; only a
   paid or COD order decrements. Undo the right one (`reservationStatus`).
6. **Errors are honest.** `sendError(res, err)` → `describeError` classifies
   (validation 400, bad id 400, duplicate 400, else 500). Never
   `res.status(500).json({ message: err.message })`. The message is the shop
   talking to a person, and it says what to do next.
7. **User input never reaches Mongoose raw.** Sort keys through a whitelist
   (`SORTS[sort]` in `controllers/productController.js`), regex through `escapeRegex`, HTML through the model's
   allowlist validator (refuse, don't clean), ids through `isValidObjectId`.
8. **Idempotent where the world retries.** Razorpay and Shiprocket webhooks
   arrive twice; a state machine that only moves forward (`applyCourierUpdate`
   never walks a parcel backwards).
9. **Tests never touch the world.** `tests/setup.mjs` sets dummy keys and a
   never-connected Mongo URI; paid APIs (Gemini, Cloudflare, Pollinations,
   Razorpay, Shiprocket) are mocked. 910 tests run in under a minute with no
   database; keep it that way.
10. **Every behaviour has a WHY block** above it — what it replaced and why.
    Match that voice.

## Conventions and names
- Error reply: `sendError(res, err)` from `utils/apiError.js` (`describeError` classifies validation / bad id / duplicate as 400). Never a raw 500 with `err.message`.
- Auth: `middlewares/authMiddleware.js`, `roleMiddleware.js`, `checkSellerStatus.js` (`requireApprovedSeller`); capabilities in `utils/capabilities.js` (one account, roles as capabilities, `/auth/switch-context`).
- Money: `sellerMoneyFor(order, sellerId)` in `sellerController` (subtotal / stamped commission / earning); refunds via `utils/refund`; payout state via `sellerPayoutStateFor`, `returnWindowFor` (`utils/payout.js`).
- Rulebook: `config/sellerRules.js` (version, penalties, windows) — the agreement page, consent, payout and dashboard all read it; bump `version` when a rule changes. Charges ledger `models/SellerCharge.js`, `utils/sellerCharges.js` (`chargeForSellerCancel`, `applyChargesToPayout`).
- Google: `utils/google/serviceAuth.js` (service-account JWT → token, no library), `utils/google/searchConsole.js` (`queries`), `controllers/searchInsightsController.js` (admin: whole site; seller: only their product pages). Key in `private/`, never in the repo.
- Truth helpers: `utils/cancelOrder.js` (`CANCELLABLE`, `canCancelOrder`, `cancellableItemIds`, `cancelOrderFor`), `utils/deliveryTruth.js` (`sellerMayDeclareDelivered`, `customerMayDispute`, `payoutBlockedReason`), `applyCourierUpdate` (forward-only).
- Input: `escapeRegex`, whitelisted `SORTS` map in `controllers/productController.js`, HTML allowlist validator on `Product.description`, `cloudinary.isOwnUrl`.
- Cache: `middlewares/cacheControl.js` (`noStore` global, `publicCatalogue` on public routes). CORS from `FRONTEND_URL`.
- Tests: vitest, `tests/setup.mjs` sets dummy keys and a never-connected `MONGO_URI`; 910 tests, no database, under a minute. Paid APIs (Gemini, Cloudflare, Pollinations, HF, Razorpay, Shiprocket, Brevo) always mocked.
- AI: `utils/ai/{providers,catalog,imageGen,status,listing}.js`; quotas are real — test with mocks, 2–3 real heavy calls a day at most.
- Rate limits: `middlewares/rateLimits.js` (`authLimiter`, `checkoutLimiter`, `aiLimiter`; off under test unless `RATE_LIMIT_TEST=1`); `helmet` and `trust proxy` in `app.js`. Public catalogue handlers live in `controllers/productController.js`; `routes/productRoutes.js` is 15 lines. No request-validation layer yet (by hand, per controller).

## Record after building
WHY block above the behaviour; `FRONTEND-PLAN.md` §4 if the interface changed, `OPS-AND-MANUAL-ACTIONS.md` changelog if operations did; `WHAT-IS-LEFT.md` row.
