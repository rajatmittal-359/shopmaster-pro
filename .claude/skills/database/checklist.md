# The database checklist

Distilled from MongoDB's own agent skills (`mongodb-schema-design`,
`mongodb-query-optimizer`, `mongodb-connection`) and the book-backed
`mongodb-expert-skill` (*The Definitive Guide*, *MongoDB 8.0 in Action*),
minus what does not apply to one Atlas cluster serving a small marketplace.
Report failures in this order.

## 1. Shape — embed or reference

| Relationship | Cardinality | Read together? | Do |
|---|---|---|---|
| One-to-one | 1:1 | always | embed |
| One-to-few | 1:N, N small and **bounded** | usually | embed array (order items, fulfilments) |
| One-to-many | 1:N, N can grow | often apart | reference (inventory log, reviews, payouts) |
| Many-to-many | M:N | varies | ids on both sides, or a join collection |

- Design from the query, not the entity: list the endpoint's fields, shape
  the document to return them in one read.
- **Unbounded array** anywhere → fail. 16 MB is a hard limit; long before it,
  the array is a performance bug.
- Data updated together and needing atomicity → same document.
- Data that changes independently and often → do not copy it (or name the
  pattern and write the update path).
- A snapshot is not duplication: order lines freeze `name`, `price`,
  `commissionAmount` on purpose. Say which one a copied field is.
- `$lookup` on a hot read path → consider an extended reference (copy the two
  or three fields the list needs).
- Collections are not partitions: never one collection per seller / month /
  category — index a single collection.
- Single-type collections; polymorphic only with a discriminator and a reason.
- Schema validation (`$jsonSchema`) for invariants Mongoose alone cannot hold
  when scripts write directly; introduce as `moderate` + `warn`.

## 2. Fields and types

- Ids as `ObjectId`; dates as `Date`; money as `Number` in rupees, rounded at
  the boundary; booleans as booleans; enums with `enum: [...]` and a default.
- Names: camelCase, one meaning per name across collections (`sellerId`
  means the seller's **User** id everywhere it appears — check before reuse).
- Every field the API returns to a page is either stored or derived by a
  named helper — no field lives only in one controller's imagination.
- `required` + `default` decided per field, not left to `undefined`.
- Timestamps on (`{ timestamps: true }`) unless there is a reason not to.

## 3. Indexes

- Compound key by **ESR** — Equality (most selective first) → Sort → Range.
  `$in` with ≤ 200 values counts as equality; `$ne`, `$gt`, anchored regex
  are range.
- One index per query shape; `$or` needs every branch indexed or it is a
  COLLSCAN. Prefer `$in` over `$or`.
- Do not index: fields with two or three values alone (`status` by itself is
  weak — it is fine as the second key), fields whose query returns > ~30 %
  of the collection, fields no query filters or sorts by.
- Prefer **partial** over sparse for "only where X" (e.g. only open disputes).
- Unique where the domain says unique (one review per user per product; one
  usage row per scope/key/day).
- Text index vs regex: the product `text` index exists; the suggest endpoint
  uses an anchored word-boundary regex deliberately (prefix matching that
  `text` cannot do). Atlas Search is the upgrade path, not another regex.
- TTL index for anything that expires (reservations, drafts, OTPs) rather
  than a cron delete — when the volume justifies it.
- Every index costs RAM and a write; remove the ones Performance Advisor
  says are unused.
- Multikey (array) fields in a compound index: at most one array field.

## 4. Queries and updates

- Filter, sort, limit **before** anything expensive; `$match` → `$sort` →
  `$limit` early in a pipeline; filter before `$unwind`.
- Project only what the page needs (`select`, `projection`); a covered query
  (`totalDocsExamined: 0`) when the list is hot.
- Pagination by `limit`/`skip` is fine at our size; note the cursor
  (`_id` or `createdAt`) alternative for the day it is not.
- Updates by operator (`$set`, `$inc`, `$push` with `$slice`), not
  read-modify-save, when two writers can race (stock, counters, usage).
- Multi-document invariants (stock + order + inventory log) in one session
  transaction; everything else without.
- `lean()` for read-only lists; documents only where a method or save is
  needed.
- No user input as a key (`$`-prefixed or dotted) in a filter or update.

## 5. Proof — reading `explain("executionStats")`

| Field | Target |
|---|---|
| `stage` | `IXSCAN` / `EXPRESS_IXSCAN`; never `COLLSCAN` on a hot path |
| `SORT` stage present | no — the index should serve the sort |
| `totalKeysExamined` | ≈ `nReturned` |
| `totalDocsExamined` | ≈ `nReturned`; 0 when covered |
| `indexBounds` | exact `[v, v]` for equality keys; unbounded `[MinKey, MaxKey]` means the key was not used |

Run before and after. Paste both. A cold first run includes trial plans in
`executionTimeMillis` — compare stages and counts, not milliseconds.

## 6. Migrations and operations

- Script in `backend/`, idempotent, `--dry-run` prints counts, `--revert`
  exists, one log line per changed document or a summary with ids.
- Backfill in batches with `bulkWrite`; never `updateMany` with a computed
  value across the whole collection in one statement without a dry run.
- New required field → add with a default or backfill first, then require.
- Index build on production: `createIndex` is online on Atlas, but build it
  off-peak and record it.
- Atlas: connection string in env only; Performance Advisor and slow-query
  log are the first place to look before guessing.
- Connection pool: leave driver defaults until a measured pool exhaustion;
  then the OLTP table (maxPool by peak concurrency, `serverSelectionTimeoutMS`
  5 s, `socketTimeoutMS` 30 s).

## Per-collection quick asks

| Collection | Ask before touching |
|---|---|
| `Order` | Are you freezing a fact at sale, or reading a live one? Does it belong on the order, the fulfilment (per seller) or the item (per line)? Which existing index serves the new query? |
| `Product` | Will the feed (Merchant Center) or JSON-LD read this field? Is it a variant-level fact (size, colour) or product-level? |
| `Inventory` | Append-only. Every stock movement has an order id or an actor; never edit a row. |
| `Payout` | Money leaving. Amount from `sellerMoneyFor` at the time; state forward-only; who marked it paid. |
| `AiUsage` / `AiProviderState` | Keyed per day / period; `$inc` not read-modify-save; unique index is the lock. |
| `Category` | Ancestors array kept true on move; products only on leaves. |
