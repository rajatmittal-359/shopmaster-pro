# ShopMaster Pro — database rules (read by the `/database` skill)

## Goals the gate checks against
Liquidity · Trust · Seller recruitment · October 2026 cutover. Stage: one Atlas cluster (Mumbai), ~50 products, single-digit orders a day. A COLLSCAN is invisible today and a habit tomorrow — fix the habit, record the scale work.

## Access
`MONGO_URI` in `backend/.env` only. The `mongodb-atlas` MCP, once Rajat authorises it via `/mcp`, is **read-only** (`explain`, `collection-indexes`, `find`); writes only through scripts he runs. Migrations are recorded in `OPS-AND-MANUAL-ACTIONS.md` → "Migrations applied".

## This schema's truths — these outrank the generic checklist

- **`Order` is the aggregate.** It embeds `items[]` (one per line, with
  `sellerId`, `name`, `price`, `commissionAmount` **frozen at sale** — a
  snapshot, so a seller editing the listing cannot change what was paid) and
  `fulfilments[]` (one per seller: status, AWB, delivered/return/dispute
  state, payout hold). Both arrays are **bounded** (a basket has a handful of
  lines and at most a few sellers), which is why embedding is right.
  `populate('items.productId', 'name slug images')` is for display only; the
  snapshot decides money.
- **Reference where it grows without bound**: `Inventory` (the stock audit
  log), `Review`, `Payout`, `SellerCharge`, `AiDraft`, `AiUsage` are their own collections.
  Never push into an array that a busy shop can make unbounded.
- **Derived state is computed, not stored twice**: order status derives from
  fulfilments; `canCancel` / `canReturn` / `canDispute` are computed on read
  by helpers in `utils/`. Store facts (dates, ids, who), derive verdicts.
- **Indexes that exist** (keep this list true when you add one):
  `Order`: `customerId`, `items.sellerId`, `status`, `paymentStatus`,
  `{fulfilments.sellerId, fulfilments.status}`, `fulfilments.deliveredAt` ·
  `Product`: `sellerId`, `category`, text on `name`+`description`, `avgRating` ·
  `Category`: `ancestors`, `parentCategory` · `Inventory`: `productId`,
  `orderId`, `createdAt` · `Review`: `{productId, userId}` unique ·
  `Payout`: `{sellerId, createdAt}` · `AiUsage`: `{scope, key, day}` unique ·
  `AiProviderState`: `{provider, period}` unique · `SellerCharge`: `{sellerId, payoutId}` · **Atlas Search** `products_search` on `products` (name autocomplete+text, description, tags, color, brand; filters isActive, category, sellerId; numbers price/avgRating/totalReviews) — `utils/atlasSearch.js`; `npm run search-index` (`ensureSearchIndex.js`, idempotent) gives any fresh database the index; free tier allows 3. **Atlas Vector Search** `knowledge_vec` on `knowledgechunks` (vector 768 cosine + filter `audience`) — `npm run knowledge` (`indexKnowledge.js`, idempotent by hash) builds chunks + index; `KnowledgeChunk` also has a normal text index (fallback). **Atlas Vector Search** `products_vec` on `products.vector` (768 cosine; filters isActive/category/sellerId) — `npm run vectors:products` (`indexProducts.js`, hash-checked); `vector`/`vectorHash` are `select:false`. **All three free Search slots are now used** (`products_search`, `knowledge_vec`, `products_vec`) — a fourth needs M10. `AssistLog` TTL 90 days.

**Environments (decided 12 Sep 2026):** today's `shopmaster_pro` (57 products, orders, payouts, 6 sellers — realistic test data Rajat wants to keep) becomes the **dev** database at cutover; production starts clean as `shopmaster_prod` (`seed.js --minimal` + `npm run search-index`), reached only through Render's env with an Atlas user scoped to that one database. Until cutover `shopmaster_pro` is still what the domain serves — treat it as live. `seed.js --reset` refuses both names without `--i-mean-production`. M0 has no backups: `npm run backup` weekly until M10 at cutover.
- **Category tree** uses the array-of-ancestors pattern (`ancestors`,
  `parentCategory`); products must sit on a leaf (`validateLeafCategory`).
- **Reservation is a field, not a collection**: `reservationStatus` /
  `reservationExpiresAt` on the order; expired holds are released by the payment-verification path and the cron.
- **Money is a Number in rupees, rounded to 2 dp at the boundary**
  (`round2`); no floats accumulate across documents without rounding.
- **Migrations are scripts in `backend/`** (`backfillFulfilments.js`,
  `backfillProductColour.js`, `draftProductDescriptions.js --apply/--revert`):
  idempotent, logged, **reversible**, run once by hand, recorded in the OPS
  document under "Migrations applied".
- **Tests never connect.** `MONGO_URI` in tests points at a host that does not
  exist; model logic is tested through validators and helpers on plain
  objects or `new Model()` documents, never through a running database.
- **Connection**: one long-running Node process on Render; the driver default
  pool is fine at today's load. Do not add pool options without a measured
  reason (the connection skill's OLTP table is for when there is one).

## Per-collection quick asks

| Collection | Ask before touching |
|---|---|
| `Order` | Are you freezing a fact at sale, or reading a live one? Does it belong on the order, the fulfilment (per seller) or the item (per line)? Which existing index serves the new query? |
| `Product` | Will the feed (Merchant Center) or JSON-LD read this field? Is it a variant-level fact (size, colour) or product-level? |
| `Inventory` | Append-only. Every stock movement has an order id or an actor; never edit a row. |
| `Payout` | Money leaving. Amount from `sellerMoneyFor` at the time; state forward-only; who marked it paid. |
| `AiUsage` / `AiProviderState` | Keyed per day / period; `$inc` not read-modify-save; unique index is the lock. |
| `Category` | Ancestors array kept true on move; products only on leaves. |
| `Notification` (14 Sep) | A person's bell. Write only through `utils/notify` (never `Notification.create` from a controller). `tag` is the dedupe key - unique partial index `{userId, tag}`; `{userId, createdAt:-1}`, `{userId, readAt}`; TTL 90 days on `createdAt`. Backfill: `npm run notifications:backfill` (idempotent). |
| `SearchLog` (14 Sep) | What shoppers typed in our search, one row per term per day, `$inc` via `SearchLog.record` (fire-and-forget from listProducts). No user data. TTL 180 days. Read by `utils/googleReadiness`. |
| `PushSubscription` (14 Sep) | One browser on one device. `endpoint` unique; `userId` indexed. Rows are deleted by the sender on 404/410 - never "clean up" by hand. |

**Seller application (15 Sep 2026, plan 2.40):** `Seller.application` = { legalName, pan, gstMode gstin|enrolment|none, gstin, enrolmentNumber, phone, city, pincode, sells, shopPhoto, boardRead{text,isShop,at}, status submitted|needs_info|approved|rejected, infoRequested{reason,at}, rejectReason, submittedAt, reviewedAt }. The switches the API enforces stay `isApproved` / `kycStatus` / `status` (active|suspended) - `application.status` is the review conversation, derive the row state from all three. `bankDetails.bankName/branch/ifscLookupFailed` are filled from Razorpay's IFSC dataset on save. Validation lives in `utils/kyc.js` (pure) and `utils/application.js` (request → fields, duplicates query); never store a PAN that failed `checkPan`. The public seller route exposes `legal.{name,gstin,enrolled}` and never the PAN.

**Sessions (19 Sep 2026, plan §4.46):** `Session` = one device: { userId, tokenHash (SHA-256 of the refresh token - the token itself is never stored), family, deviceId (the server-issued `smp_device` cookie - the user-agent is never a trust signal), ua, ip, lastUsedAt, expiresAt (TTL), revokedAt, replacedBy }. Only `utils/auth/session` writes it. `User.tokenVersion` is stamped into every access token - bump it (via `revokeAll`) to end every session; never edit by hand. `User.failedLogins/lockUntil` are the sign-in lock. `AuthEvent` = { userId, type, ip, ua, meta, at } with a 180-day TTL - append-only, written through `session.record`. Access tokens carry `sid`; `req.auth.sid` is the current device.

**Invoices (15 Sep 2026, plan §4.43):** `Seller.invoiceSeq` + `invoicePrefix` are the shop's own series - only `utils/invoice.nextInvoiceNumber` may touch them (atomic `$inc`; never set by hand, never reset except by `migrateToProd`). `Order.invoices[]` = { sellerId, number, issuedAt }, one per seller, written once by `assignInvoiceNumbers` (guarded on `invoices.0` absent; a lost race returns the stored set) **after** the checkout's `commitTransaction` - never inside a transaction, the Seller counter is a shared hotspot - and lazily from the customer's or the seller's order read. Order lines carry `hsn` and `gstRate` copied from the product at checkout, next to `soldBy`; the tax split is arithmetic on the line (`taxFor` → scheme, per-line splits, totals, `unsplit` count), computed server-side in the order read and never stored or re-derived in the browser; a line without a rate splits to `null`, never to 0% tax. `Product.hsn` (4/6/8 digits) and `gstRate` (slab or null) are set only through `cleanHsn`/`cleanGstRate`.

**Categories (13 Sep 2026):** two levels, names unique, `googleProductCategory` on each (Google Product Taxonomy path; the feed sends it, leaf falls back to parent). The tree lives in `config/taxonomy.js` (23 mains / 168 subs) and `seedCategories.js` grows a database to it add-only. Sellers never create categories - they file a `CategoryRequest`; the admin creates or declines from the Categories page.
