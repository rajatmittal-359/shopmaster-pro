---
name: database
description: Data-model, index and query work on ShopMaster Pro's MongoDB Atlas (Mongoose 9). Use for a new collection or field, an embed-vs-reference question, a slow query, an index, a migration or backfill. Access pattern first, then MongoDB's own rules (schema patterns, ESR, explain), then this schema's truths - options with one recommendation; explain() before and after; nothing written to Atlas without a reversible script and a yes.
---

# Database — design from the query, prove it with explain()

MongoDB's own guidance is the reference here — the `mongodb-atlas` plugin's
skills (`mongodb-schema-design`, `mongodb-query-optimizer`,
`mongodb-connection`) and the book-backed `mongodb-expert-skill` clone
(`references/performance.md`, `schema-design.md`). What they cannot know is
*this* schema: why an order embeds its fulfilments, why an order line freezes
the price, which indexes already exist. That is section 0, and it wins.

## 0. This schema's truths

- **`Order` is the aggregate.** It embeds `items[]` (one per line, with
  `sellerId`, `name`, `price`, `commissionAmount` **frozen at sale** — a
  snapshot, so a seller editing the listing cannot change what was paid) and
  `fulfilments[]` (one per seller: status, AWB, delivered/return/dispute
  state, payout hold). Both arrays are **bounded** (a basket has a handful of
  lines and at most a few sellers), which is why embedding is right.
  `populate('items.productId', 'name slug images')` is for display only; the
  snapshot decides money.
- **Reference where it grows without bound**: `Inventory` (the stock audit
  log), `Review`, `Payout`, `AiDraft`, `AiUsage` are their own collections.
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
  `AiProviderState`: `{provider, period}` unique.
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

## Gate — the business goal, before any option

Rajat, 12 Sep 2026: *"business goal samjhe bina aur research kare bina approve
nahi karna faltu cheezon ko."* So before voices A–D, answer in one line each:

1. **Which goal does this serve?** The marketplace has three (plan §2a):
   **liquidity** — more buyers finding more of what the sellers we have
   actually stock; **trust** — a stranger in Jaipur or Jhansi believing the
   shop and the seller (reviews, verified purchase, honest status, honest
   money); **seller recruitment** — the next shop in Jaipur choosing to list
   here and being able to run its business from the panel. Plus the one
   deadline: the **October cutover** with nothing the React app could do
   missing.
2. **What does the research say people at our stage do?** Not what Amazon
   does at scale — what the references do that a three-seller,
   single-digit-orders-a-day shop needs *now*. If no reference does it, say so.
3. **What breaks or costs if we do not build it?** A named consequence
   (a lost order, a wrong payout, a disapproved feed item), or "nothing yet".

If 1 has no answer, or 3 is "nothing yet", it is **not an option** — it goes
to `WHAT-IS-LEFT.md` §4 with the reason, and the reply says so in one line.
Rajat asking for something does not skip the gate; the gate is how he is
protected from his own "kar do" at midnight, and from mine.

## 1. Name the access pattern

Before any schema talk: **which endpoint or page, which fields, how often,
filtered and sorted by what, how many documents back**. MongoDB's first rule
is "data accessed together is stored together"; you cannot apply it without
this line.

## 2. Decide shape (voice B — MongoDB's rules)

Use the embed/reference table (`checklist.md` §1). Check the anti-patterns:
unbounded arrays, `$lookup` on a hot path, a collection used as an index, an
index nobody's query uses, documents bloated with data not read together.
Name the pattern you are using (extended reference, computed, bucket,
schema-versioning…) — the `mongodb-schema-design` references have one file
per pattern.

## 3. Decide the index and prove it (voice B — optimizer)

- Compound key by **ESR**: equality fields (most selective first) → sort
  fields → range fields. One index per query (except `$or`). Do not index a
  field that returns > ~30 % of the collection or has two values.
- **Prove it with `explain("executionStats")`**: `IXSCAN` not `COLLSCAN`, no
  blocking `SORT` stage, `totalKeysExamined ≈ nReturned`,
  `totalDocsExamined ≈ nReturned` (0 when covered). Before and after.
- Where to run it: the `mongodb-atlas` MCP (`explain`, `collection-indexes`,
  Atlas Performance Advisor) once Rajat has authorised it — **read-only**;
  otherwise a one-off script against a dev connection Rajat runs and pastes.
  Never reason about a plan you did not see when a plan can be had.

## 4. Judgment (voice C)

~50 products, a few sellers, single-digit orders a day: a COLLSCAN on
`products` is invisible today and a habit tomorrow. Say which fixes are for
now and which are for the day the numbers change — and write the latter into
`WHAT-IS-LEFT.md` rather than building them early.

## 5. Options and one recommendation — then stop

```
Access pattern
  endpoint · fields · filter/sort · volume

Shape
  embed / reference, pattern name, why (bounded? read together? updated together?)

Index
  key by ESR · explain before → after (stages, keys/docs examined)

Migration
  script name · idempotent? · reversible? · run when?

Options
  A. … B. …
Recommendation: <letter>, because <one sentence>.
Your call.
```

## 6. Build — test, script, prove, record

- Model change with its **WHY block**; validators at the model
  (`validateSync` path validators for anything that must be refused).
- **Test first** on the validator or helper — no database.
- Index declared in the model **and** the list in §0 updated.
- Backfill as a script: dry-run flag, counts printed, `--revert`, idempotent
  (second run changes nothing). Rajat runs it against production; the run is
  recorded in the OPS document.
- **`explain()` after**, pasted into the plan paragraph.
- `$jsonSchema` validation on a collection is introduced as
  `validationLevel: moderate` + `validationAction: warn`, tightened later.

## What this skill refuses

- Writing to Atlas from this session — no `updateMany`, no index build, no
  drop — without a script, a dry run, and Rajat's yes. The MCP stays read-only.
- Adding a field the frontend does not read or an index no query uses.
- A second copy of a fact that already derives (status, totals, verdict
  flags) unless it is a named pattern (computed/extended reference) with the
  update path written down.
- Storing money as a float string, a date as a string, or an id as a string
  where an `ObjectId` belongs.
- Any array that a busy shop can grow without bound.
