# Code Structure Review

**Date:** 5 September 2026
**Question being answered:** is every file in the right place, with the right
name, so that a solo developer — and an AI working on this repo — can find
things without hunting?

**Measured, not guessed:** 9,422 lines of backend (excluding tests), 8,164 lines
of frontend, 27 test files.

---

## Verdict first

The architecture is **sound**. The layering is real: routes wire, controllers
handle requests, models own schema, and business rules live in their own modules
(`commission`, `payout`, `reservation`, `shipping`). That is the separation that
actually matters, and most solo projects never get it.

The problems are **naming and placement**, not design. Nine findings, ranked by
how much time each one costs when you or an AI go looking for something.

Nothing here requires a rewrite. The most expensive fix is an afternoon.

---

## Tier 1 — these actively cause wrong edits

### 1. `productRoutes.js` holds 213 lines of business logic, and there is no `productController.js`

Every other route file is pure wiring:

| Route file | Lines | Controllers it delegates to |
|---|---|---|
| `adminRoutes.js` | 61 | admin, payout |
| `authRoutes.js` | 21 | auth |
| `customerRoutes.js` | 88 | address, customer, razorpay, wishlist |
| `inventoryRoutes.js` | 14 | inventory |
| `reviewRoutes.js` | 31 | review |
| `sellerRoutes.js` | 67 | payout, seller |
| **`productRoutes.js`** | **213** | **none — 8 inline handlers** |

And the logic in there is not trivial. It contains the category-subtree rollup,
the slug-or-ObjectId resolution, and the soft-404 rule that stops Google
indexing empty category pages. That is real, load-bearing catalogue logic
sitting in a file whose job is supposed to be routing.

**Why it costs you:** ask an AI "where is the product search filter?" and it
looks in `controllers/`, finds nothing product-shaped, and may well write a new
`productController.js` — leaving you with two implementations.

**Fix:** create `controllers/productController.js`, move the eight handlers into
it, leave `productRoutes.js` as wiring like its six siblings. Pure move, no
logic change.

### 2. `InventoryLogsPage.jsx` exists twice

```
frontend/src/pages/admin/InventoryLogsPage.jsx    271 lines
frontend/src/pages/seller/InventoryLogsPage.jsx   234 lines
```

This is the only duplicated filename in the whole repo. "Open file by name"
gives two identical-looking results, and an instruction like *"fix the date
format in InventoryLogsPage"* is genuinely ambiguous — an AI can edit the wrong
one and the change silently does nothing.

**Fix:** rename to `AdminInventoryLogsPage.jsx` and `SellerInventoryLogsPage.jsx`.
Two renames and two import lines.

### 3. The `controllers/` listing does not match the API surface

Ten controllers, seven route files. Four controllers have no route file of their
own and are mounted inside someone else's:

| Controller | Actually mounted in |
|---|---|
| `addressController.js` | `customerRoutes.js` |
| `wishlistController.js` | `customerRoutes.js` |
| `razorpayController.js` | `customerRoutes.js` + `app.js` (webhook) |
| `payoutController.js` | `adminRoutes.js` **and** `sellerRoutes.js` |

So "where are the address endpoints?" cannot be answered by listing `routes/`.
`payoutController` is the sharpest case — it is split across two role route
files, which is correct behaviour but invisible from the folder tree.

**Fix (cheap):** leave the wiring exactly as it is — it is right — and put a
short comment block at the top of each route file listing what it mounts. Two
minutes each, and the tree stops lying.

---

## Tier 2 — names that hide the structure

### 4. Five shipping files, and the names do not say which is the front door

The layering underneath is genuinely good:

```
shipping.js           pricing - the single place delivery is costed   (entry point)
shipmentBooking.js    courier-agnostic orchestrator: picks the courier
  ├── shiprocketBooking.js   books via Shiprocket
  └── borzo.js               books/quotes same-day via Borzo
shiprocketService.js  raw Shiprocket API client (auth, rate lookup)
```

But searching `shipping` returns five files with no hint of the hierarchy.
`shipping.js` vs `shipmentBooking.js` vs `shiprocketBooking.js` are three
different jobs with nearly the same name.

**Fix:** group them —

```
utils/shipping/
  pricing.js       (was shipping.js)
  booking.js       (was shipmentBooking.js)
  providers/shiprocket.js
  providers/borzo.js
```

The folder becomes the answer to "where is shipping", and `pricing` vs `booking`
says what each does.

### 5. `utils/` is three different kinds of thing in one folder

Fourteen files, three distinct categories:

| Kind | Files | What it really is |
|---|---|---|
| **Business rules** | `commission`, `payout`, `reservation`, `shipping` | your domain logic — the service layer |
| **Third-party clients** | `cloudinary`, `sendEmail`, `shiprocketService`, `borzo` | integrations |
| **Helpers** | `apiError`, `tokenUtils`, `emailTemplates`, `sendSafeEmail` | genuinely utilities |

The most valuable code in the backend — the money rules — is filed under a name
that means "miscellaneous".

**Fix:** `services/` (business rules), `integrations/` (third-party), `utils/`
(helpers). Pure moves. This also answers the "should I add a service layer?"
question that every Express guide raises: **you already have one**, it is just
called `utils/`.

### 6. `HomePage.jsx` is the `/shop` page

```jsx
<Route path="/shop" element={<HomePage />} />
```

There is no home page — `/` redirects to `/shop`. Rename to `ShopPage.jsx`.

### 7. Frontend services mix two naming schemes

```
by domain : cartService, productService, orderService, reviewService,
            addressService, wishlistService, inventoryService, authService
by role   : adminService, sellerService
hybrid    : sellerOrderService
```

`sellerOrderService` vs `orderService` is the confusing pair — you cannot tell
from the name that one is the seller's queue and the other the customer's
orders. Not urgent, but worth settling on one scheme when you next touch them.

---

## Tier 3 — clutter

### 8. Four one-off scripts sit next to the two runtime files

```
backend/
  app.js                    96 lines   runtime
  server.js                 19 lines   runtime
  seed.js                  803 lines   script
  addProductImages.js      264 lines   script
  generateSitemap.js       123 lines   script
  backfillFulfilments.js    95 lines   script
```

1,285 lines of scripts beside 115 lines of actual application. **Fix:** move all
four into `backend/scripts/` and update the four `package.json` script paths.

### 9. Three `.env` files, no `.env.example`

`backend/.env`, `.env.real`, `.env.seed` — and nothing that documents which keys
are needed. You have already lived through losing this project locally and
recovering it from GitHub plus Render. A committed `.env.example` (names only,
no values) is what makes that recovery painless next time.

Also: `testcredentails.txt` is misspelled (`credentails` → `credentials`). It is
gitignored now, so this is cosmetic.

### 10. `components/seller/` does not exist

`components/` has `admin/` (1 file), `common/` (5), `customer/` (2) — but no
`seller/`, despite six seller pages including `MyProductsPage.jsx` at **830
lines**, the largest file in the frontend. Nothing has ever been extracted from
it.

Not a naming problem, just the one place where a file has grown past comfortable.
Worth splitting the product form out when you next work on it — not before.

---

## What NOT to do

Being explicit, because the guides will tell you otherwise and it would be the
wrong call here:

- **Do not add a formal `services/` layer with interfaces and DI.** You already
  have the separation that matters. Renaming the folder is enough.
- **Do not split `sellerController.js` (874) or `customerController.js` (873)
  just because they are long.** They are long but cohesive — one role, one file.
  Splitting them into `sellerProductController` / `sellerOrderController` /
  `sellerPayoutController` would mean more files to search, not fewer.
- **Do not introduce a monorepo tool, path aliases, or barrel `index.js` files.**
  Two folders and relative imports are fine at this size, and barrel files make
  it *harder* for an AI to trace where something comes from.
- **Do not reorganise by feature** (`features/orders/`, `features/products/`).
  It is a real pattern, but converting mid-project costs days and buys nothing
  until several people are working in parallel.

---

## The single highest-value thing: a `CLAUDE.md`

Your actual goal was *"jab bhi AI se kaam karwau usse aasani ho code dhundhne
me"*. The direct answer to that is not a folder rename — it is a `CLAUDE.md` at
the repo root, which Claude Code reads automatically at the start of **every**
session, without being asked.

It should carry the things that are expensive to rediscover each time:

- **Where things live** — the map above
- **The money invariants** — commission is snapshotted per line and never
  recalculated; `available = stock − reserved`; a payout claims lines by
  stamping `payoutId` only where it is null; delivery is per-seller via
  `fulfilments`, never order-level; the Razorpay webhook must stay registered
  before `express.json()`
- **Commands** — `npm test`, `npm run seed`, `npm run sitemap`, the backfill
- **House rules** — no `npm install` on this machine, commit at milestones only

That file would have saved most of the exploring done in this session.

---

## Suggested order

| # | Change | Effort | Why this order |
|---|---|---|---|
| 1 | Write `CLAUDE.md` | 30 min | Pays back immediately, every session |
| 2 | Extract `productController.js` | 45 min | The one real inconsistency |
| 3 | Rename the two `InventoryLogsPage.jsx` | 10 min | Stops wrong-file edits |
| 4 | Move scripts to `backend/scripts/` | 15 min | Cleans the backend root |
| 5 | Split `utils/` into `services/`, `integrations/`, `utils/` | 45 min | Names finally describe contents |
| 6 | Group the shipping files | 30 min | Five files become one folder |
| 7 | `HomePage.jsx` → `ShopPage.jsx`, add `.env.example` | 15 min | Small honesty fixes |
| 8 | Move these `.md` files into `docs/` | 5 min | The repo root is starting to collect them |

Items 2–7 are pure moves and renames — no behaviour changes, and the 371 tests
will tell you immediately if an import was missed.

**Do not do all eight at once.** Each is a self-contained commit; run the tests
after each so any breakage has one obvious cause.
