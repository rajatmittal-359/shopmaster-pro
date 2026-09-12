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
  `AiProviderState`: `{provider, period}` unique · `SellerCharge`: `{sellerId, payoutId}`.
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
