# ShopMaster Pro: Ground Truth

*Read-only forensic audit · No code modified*

A MERN multi-vendor marketplace with live customers, live payment credentials, and three payment-critical defects that have been shipping quietly. Here is what actually exists, what actually works, and what is genuinely worth rebuilding.

- **Scope:** 107 files · ~12,000 LOC · backend + frontend
- **Branch:** main @ 1757f39
- **Date:** 29 Aug 2026
- **Changes made:** none

---

## A. Executive Summary

### What this project actually is

ShopMaster Pro is a genuinely functional three-role multi-vendor marketplace, built for the Indian market, that has been deployed and connected to real third-party services. It is not a tutorial clone. The backend is Express 5 + Mongoose 9 on MongoDB Atlas; the frontend is React 19 + Vite 7 + Redux Toolkit + Tailwind 4. It integrates Cloudinary (image CDN), Razorpay (payments), Shiprocket (shipping rates), and SendGrid (transactional email).

The database it points at is **live and populated** with real seeded categories, real seller accounts, and real products with real Cloudinary images. The `.env` holds **live-mode** Razorpay keys. This is or was a production system, not a sandbox.

### Current condition

The project sits at roughly **75% functional completeness with a critically broken 25%** — and the broken quarter is concentrated exactly where it hurts most: money movement, tenant isolation, and account recovery.

The honest characterization is *ambitious scope delivered under time pressure, then patched reactively*. The evidence for reactive patching is everywhere and unambiguous: 30 commits named some variant of "done"/"donee"/"doneee", comments reading `// DO NOT TOUCH THIS LOGIC (CRITICAL)`, stale comments that contradict the code beneath them, and a payment-status value (`'completed'`) referenced in eight places that **does not exist in the schema enum**. That single mismatch silently disables every automatic refund path in the application.

> **The three findings that matter most**
>
> **1. Payment verification can be replayed against any order.** `verifyRazorpayPayment` validates the Razorpay signature but never checks that the signed order ID belongs to the order being marked paid, and never checks order ownership. One valid ₹1 payment receipt can mark an arbitrary pending order as paid.
>
> **2. Refunds never fire.** Cancel and return check `paymentStatus === 'completed'`, but the enum only permits `pending | paid | failed | refunded`. Prepaid customers who cancel get their order cancelled, their stock restored, their order total zeroed — and no money back.
>
> **3. Every seller sees every other seller's inventory movements.** The inventory log endpoint returns the entire collection unfiltered to any authenticated seller. In a multi-vendor marketplace this is a cross-tenant data breach, and it is visible in the UI.

#### Genuine strengths

- Real domain depth — COD *and* prepaid, partial item cancellation, returns, live shipping-rate lookup, verified-buyer reviews, an inventory audit-log model, two-level categories.
- Correct instincts on hard parts: MongoDB transactions around checkout, HMAC signature verification, soft-delete on products, an idempotency guard in the webhook, bcrypt hashing, per-seller order filtering in the order controllers.
- Clean, consistent layering — routes / controllers / models / middlewares / utils, mirrored by services / pages / components on the frontend. It installs, builds, and boots on a fresh clone.
- Genuinely useful UI: seller order fulfilment with tracking + email, admin analytics with charts, filterable inventory logs, wishlist, address book.

#### Genuine weaknesses

- Payment integrity is not enforced end-to-end; the webhook safety net is non-functional.
- Seller approval is decorative — an unapproved seller can list and sell immediately.
- No tenant isolation on inventory logs; no ownership check on address mutation.
- An unverified account is unrecoverable: no resend-OTP, no forgot-password, and the OTP screen loses its state on refresh.
- Zero tests. Zero input validation layer. No rate limiting, no security headers.
- Live secrets in a working directory; a committed admin seeder with a hard-coded six-digit numeric password (value redacted here; see `createAdmin.js:24`).

### Overall portfolio potential

**High — and closer than it looks.** The hard, expensive work (domain modelling, three real integrations, three complete role workflows, a working deployment) is already done and cannot be faked. What is missing is the correctness and discipline layer, and that is a matter of weeks, not months.

The strategic read: **do not add features.** Feature breadth is already above what most portfolio projects show. The gap between this project and a credible senior-level portfolio piece is entirely about *trustworthiness* — correct money handling, enforced tenant boundaries, tests that prove it, and documentation that explains it. Fixing those turns "an ambitious student project" into "someone who can be trusted with a client's payment flow."

---

## Fresh-Clone Baseline

*Performed on this machine from the clean clone. Dependencies installed; backend booted; live API probed; frontend built and linted. No source file was modified.*

| Check | Result |
|---|---|
| Backend install | **WARN** — Passes, 10 high CVEs |
| Frontend install | **PASS** — Clean, 0 CVEs |
| Frontend build | **WARN** — Passes, 898 KB bundle |
| Backend boots | **PASS** — Port 5000 |
| MongoDB Atlas | **PASS** — Connects, 1.7 s |
| Public API | **PASS** — Returns live data |
| Lint | **FAIL** — 25 errors, 5 warnings |
| Tests | **FAIL** — None exist |

### What was verified working, with evidence

```
GET /                              → 200  {"message":" ShopMaster Pro API is running!"}
GET /api/public/products?limit=2   → 200  live products, Cloudinary image URLs, populated seller + category
GET /api/public/products/categories/all → 200  seeded 2-level category tree
GET /api/nope                      → 404  {"message":"Route not found"}
GET /api/customer/cart  (no token) → 401  {"message":"No token, authorization denied"}
GET /api/admin/analytics (no token)→ 401  {"message":"No token, authorization denied"}
mongoose.connect(MONGO_URI)        → connected, db = shopmaster_pro_v2
```

### Notable baseline observations

- **Atlas accepted a connection from an arbitrary new machine.** Strong evidence the cluster's IP allowlist is `0.0.0.0/0`. Combined with credentials living in a working directory, this is the single largest blast-radius exposure.
- **The frontend lockfile is not committed.** `backend/package-lock.json` is tracked; the frontend has none, so frontend builds are not reproducible across machines or CI.
- **`axios` is an undeclared dependency.** `backend/utils/shiprocketService.js` requires it, but it appears nowhere in `backend/package.json`. It currently resolves only because `razorpay` and `@sendgrid/mail` hoist it. A dependency bump or a stricter installer breaks all shipping-rate lookups.
- **No `.env.example`.** A fresh clone has no way to know that 24 environment variables are required. Setup is undocumented — the README's Installation section is an empty heading.

> **Files this audit created**
>
> Only build artifacts, all outside version control: `backend/node_modules/`, `frontend/node_modules/`, `frontend/dist/`, and `frontend/package-lock.json`. The last of these is untracked and will now appear in `git status` — committing it would be a genuine improvement, but that is your call, and no Git command was run. This report itself was subsequently written to the project root as `AUDIT-REPORT.md` and `AUDIT-REPORT.html`; both are untracked. No application source file, configuration file, or Git state was modified.

---

## B. Architecture Map

*How the pieces actually connect, traced end to end rather than inferred from folder names.*

### Request path

```
Browser (React 19 / Vite)
  └─ axios instance  src/utils/api.js
       baseURL = VITE_API_URL  →  http://localhost:5000/api
       request interceptor attaches  Authorization: Bearer <localStorage.smp_token>
       ✗ no response interceptor — a 401 is never handled globally
            │
            ▼
Express 5  backend/server.js
  express.json({limit:"10mb"})          ← runs FIRST, for every path
  cors({ origin:[4 hardcoded origins], credentials:false })
  startCronJobs()
  POST /api/customer/razorpay/webhook   ← already JSON-parsed by this point ✗
  /api/auth       → public
  /api/admin      → authMiddleware + roleMiddleware('admin')
  /api/seller     → authMiddleware + roleMiddleware('seller') + checkSellerStatus
  /api/customer   → authMiddleware + roleMiddleware('customer')
  /api/public/products → fully public
  /api/reviews    → GET public, everything else customer-only
  /api/inventory  → authMiddleware + roleMiddleware(['admin','seller'])  ← no tenant filter ✗
  errorMiddleware, then a catch-all 404
            │
            ▼
Mongoose 9  →  MongoDB Atlas (shopmaster_pro_v2)
  10 models: User, Seller, Product, Category, Cart, Order,
             Address, Review, Wishlist, Inventory
```

### External services and how they are reached

| Service | Purpose | Call path | Failure behaviour |
|---|---|---|---|
| Cloudinary | Product images | base64 in JSON body → utils/cloudinary.js → upload API | Throws; request fails with 500 |
| Razorpay | Prepaid checkout, refunds | SDK, module-level client in razorpayController.js; browser loads checkout.js from index.html | Order left `pending` forever |
| Shiprocket | Live shipping rates | axios → apiv2.shiprocket.in, token cached 9 days in module memory | Silent fallback to a flat ₹100 |
| SendGrid | OTP, order, shipping emails | utils/sendEmail.js; sendSafeEmail.js swallows all errors | Silently skipped |

### Two architectural facts worth knowing up front

**A seller is a User, not a Seller.** `Product.sellerId` and `Order.items[].sellerId` both reference `'User'`, while the `Seller` document holds business metadata keyed by `userId`. This is a defensible choice, but it means seller approval status is one join away from every authorization decision — which is precisely why the approval check was never wired in.

**An Order is global, not per-seller.** A single order can contain items from several sellers, but `order.status` and `order.trackingInfo` are single fields on the parent document. There is no per-seller sub-order. This is the deepest structural limitation in the codebase and it is discussed in full in Section G.

---

## C. Feature Inventory

*Status reflects code-level evidence. "Requires runtime validation" means the code path is complete and plausible but depends on a live third party or a specific data state I did not exercise.*

| Feature | Expected behaviour | Status | Evidence | Issues |
|---|---|---|---|---|
| Register + OTP | Sign up, email OTP, verify | **PARTIAL** | authController.js:8‑96 | Seller saved before businessName check; no resend; OTP state lost on refresh |
| Login / JWT | Credentials → 7-day token | **WORKING** | authController.js:100 · tokenUtils.js | No rate limit; no refresh; no logout endpoint |
| Password reset | Forgot / reset password | **MISSING** | authRoutes.js — 4 routes only | No recovery path of any kind |
| Product browse / filter | Search, category, price, paginate | **WORKING** | productRoutes.js:83 · verified 200 | Sorting is client-side over one page only |
| Product detail + reviews | Gallery, rating, review form | **PARTIAL** | ProductDetailsPage.jsx | Verified-buyer check picks an arbitrary order; OOS products unreviewable |
| Cart | Add, update qty, remove, clear | **PARTIAL** | customerController.js:15‑82,599‑668 | Price frozen at add-time; no stock ceiling; no qty validation |
| Wishlist | Add, remove, clear, list | **WORKING** | wishlistController.js | Refetched once per product card (N+1) |
| Address book | CRUD delivery addresses | **BROKEN** | addressController.js:28‑58 | Update/delete have no ownership check — cross-user IDOR |
| Shipping quote | Live rate by pincode + weight | **PARTIAL** | shiprocketService.js · customerController.js:688 | Quote ≠ charge for COD; products carry no weight; creds logged |
| COD checkout | Order, stock down, cart cleared | **WORKING** | customerController.js:84‑290 | Transactional and sound; total may exceed the quoted preview |
| Razorpay checkout | Pay online, order confirmed | **BROKEN** | razorpayController.js:244‑354 | Verification replayable across orders; stock unreserved; can go negative |
| Payment webhook | Confirm order if browser dies | **BROKEN** | server.js:11 vs :28 · razorpayController.js:363 | HMAC computed over re-serialized JSON — always fails |
| Refunds | Auto-refund on cancel / return | **BROKEN** | customerController.js:358,547 | Guarded on a status value absent from the enum — never runs |
| Order cancel (whole) | Cancel, restore stock, refund | **BROKEN** | customerController.js:331‑411 | No refund; zeroes `totalAmount`, destroying the record; no transaction |
| Order cancel (item) | Cancel one line, partial refund | **PARTIAL** | customerController.js:414‑524 | Refund logic correct; try/catch structure malformed |
| Returns | Return a delivered order | **PARTIAL** | customerController.js:527‑597 | No refund, no window, no approval; restocks cancelled items twice |
| Seller products | CRUD, images, stock | **PARTIAL** | sellerController.js:12‑231 | `weight` dropped on create; manual stock edits not logged |
| Seller fulfilment | Advance status, add tracking | **PARTIAL** | sellerController.js:317‑393,480 | Transitions well-guarded, but one seller controls the whole order |
| Seller analytics | Product + revenue stats | **PARTIAL** | sellerController.js:401‑440 | Low-stock uses `<` here, `<=` in the list; totals disagree |
| Admin seller mgmt | Approve, reject, suspend | **BROKEN** | adminController.js:28‑113 · sellerRoutes.js:23 | Approve/reject change a flag nothing reads — purely cosmetic |
| Admin categories | 2-level CRUD with guards | **WORKING** | adminController.js:121‑278 | Partial update silently un-parents a subcategory |
| Admin analytics | Revenue, top sellers, charts | **WORKING** | adminController.js:285 · recharts | Queries a status value that never occurs (harmless no-op) |
| Inventory audit log | Every stock change, per seller | **BROKEN** | inventoryController.js:64‑77 | Returns all sellers' logs to any seller; unpaginated |
| Low-stock cron email | Daily 9am alert to sellers | **BROKEN** | jobs/cronJobs.js:27 | Reads `.userId` off a User doc → always undefined → never sends |
| Transactional email | OTP, order, shipping | **RUNTIME** | sendEmail.js · emailTemplates.js | SendGrid only; templates fine; unverified live |
| Admin order oversight | View / intervene in orders | **MISSING** | adminRoutes.js — no order routes | Admin cannot see a single order |
| Admin user mgmt | List / suspend customers | **MISSING** | adminRoutes.js | No user administration at all |

---

## D. Role-Based Workflow Audit

### Customer — the most complete role

**Works today:** browse and filter the public catalogue, view product detail with reviews, manage wishlist and address book, build a cart, get a live shipping quote, place a COD order, watch its status, cancel a single item or the whole order, request a return, and review a delivered product.

#### Where it breaks

- **Prepaid checkout is unsafe.** If the browser closes between payment and verification, the order stays `pending` forever — the webhook that exists to rescue exactly this case cannot authenticate.
- **Cancelling a prepaid order takes the money.** Order cancelled, stock returned to the seller, total set to zero, no refund issued, no error shown.
- **The quoted total can differ from the charged total on COD.** The preview requests a COD rate (including the COD fee); the actual checkout omits `paymentMethod` and so requests a prepaid rate. Two different numbers from the same courier lookup.
- **A missed OTP email is fatal.** Cannot log in ("verify your email first"), cannot re-register ("email already exists"), cannot resend, and refreshing the OTP page bounces to `/register` because `tempEmail` lives only in Redux memory.
- **Any customer can edit or delete any other customer's address** by ID.
- **Reviewing often fails for genuine buyers** — the entitlement check fetches one arbitrary delivered order rather than the one containing the product.

### Seller — functional, but with no boundaries

**Works today:** register a business, list products with up to five images, edit and soft-delete them, adjust stock, see low-stock products, view orders containing their items, advance fulfilment status through a properly guarded state machine, attach courier tracking (which emails the customer), and view analytics.

#### Where it breaks

- **Approval is theatre.** `SellerDashboard.jsx:56` shows a polite "Account under review" screen, but `checkSellerStatus` only blocks *suspended* sellers. Navigating straight to `/seller/products` works, and every backend seller route accepts an unapproved seller. Admin approval changes nothing.
- **Competitor data is visible.** The Inventory Logs page shows every seller's product names, sale volumes and stock levels.
- **Sellers collide on shared orders.** With two sellers in one order, whoever marks it "shipped" marks it shipped for both, and the single `trackingInfo` field is overwritten by the second seller to save.
- **New products have no shipping weight.** `addProduct` never reads the `weight` field the form sends; only `updateProduct` does. Every new product quotes at the 0.5 kg fallback.
- **Manual stock edits leave no audit trail** — `updateStock` writes no inventory log, so the log the seller is shown is incomplete.
- **Soft-deleted products are unrecoverable** — the list filters on `isActive: true` with no way to view or restore, while analytics still counts them.

### Admin — the thinnest role

**Works today:** view all sellers, approve / reject / suspend / activate them, full two-level category CRUD with sensible guards against orphaning and 3-level nesting, and a real analytics dashboard with 7-day revenue charts, top sellers, and a global low-stock list.

#### Where it breaks

- **Approve and reject have no effect on the system.** The most important admin action in a multi-vendor platform is a no-op. Only suspend/activate actually gate anything.
- **No visibility into orders.** No route, no page. An admin cannot investigate a disputed order, issue a refund, or see platform GMV composition.
- **No user management.** Cannot list, suspend, or assist customers.
- **Category edits lose hierarchy.** The Categories page sends `{name, description, isActive}` when toggling active; the controller then writes `parentCategory: parentCategory || null`, silently promoting a subcategory to a root category.
- **The only admin account is created by a committed script** with a hardcoded email and a hard-coded six-digit numeric password (value redacted here; see `createAdmin.js:24`).

---

## E. Backend Audit

### What is well built

- Consistent layering and naming; controllers are readable and the intent is almost always clear.
- COD checkout is a genuinely correct transactional flow: validate address → validate stock → create order → decrement stock → write inventory logs → clear cart → commit, with the confirmation email deferred to `setImmediate` so it cannot fail the request.
- The seller fulfilment state machine (`sellerController.js:352`) is explicit, forward-only, and blocks progress on unpaid prepaid orders. This is better than most projects at this level.
- `errorMiddleware` correctly translates Mongo duplicate-key, validation, and cast errors into clean 400s, and only leaks stack traces in development.
- Express 5 auto-forwards async rejections, so the absence of an `asyncHandler` wrapper is not a bug here.

### Structural problems

- **No validation layer.** Every controller trusts `req.body` and relies on Mongoose schema validation as a backstop. `quantity`, `stock`, `price`, and pagination params are never type-checked. `addAddress` spreads `req.body` *after* setting `userId`, so a caller can overwrite it.
- **No service layer, so business logic is duplicated.** The ~60-line Shiprocket rate-selection block is copy-pasted three times, in `customerController.checkout`, `customerController.previewTotals`, and `razorpayController.createRazorpayOrder` — with subtly different inputs, which is exactly why the quote and the charge disagree.
- **Two competing stock-mutation paths.** `inventoryController.applyInventoryChange()` is the intended helper, but checkout, payment verification, the webhook, and item-cancel all hand-roll the same logic inline so they can pass a transaction session. The helper cannot take a session, so it is unusable in the paths that matter — and `updateStock` uses neither.
- **Requires inside function bodies.** `sellerController.js:519‑521` and four places in the customer/razorpay controllers call `require()` mid-function, obscuring the dependency graph.
- **Debug and test surface left in production.** `GET /api/customer/test`, `GET /api/customer/test-shiprocket` (commented "TEMP TEST ONLY - later delete"), and a `console.log` of the Shiprocket login email and password length on every token fetch.
- **No pagination anywhere except the public product list.** Inventory logs, seller orders, customer orders and admin seller lists all return unbounded collections.

---

## F. Frontend Audit

### What works well

- Clean page/component/service split; an axios instance with a token interceptor; a global `ErrorBoundary`; a shared `Layout` with role-aware navigation; consistent Tailwind styling with a coherent orange identity.
- Real UX care in places — skeleton loaders, debounced shipping preview, disabled states during submission, low-stock badges, MRP strike-through, empty states with a route back to the shop.
- The seller product form does honest client-side validation before submitting.

### Real problems

- **Expired sessions fail silently.** There is no axios response interceptor. When the JWT expires, every request 401s, `loadUserThunk.rejected` clears `user` and `role` but leaves the token in `localStorage` — so the app half-logs-out into a broken state instead of redirecting to login.
- **No catch-all route.** Any unknown URL renders a blank white page — including `/cart` and `/checkout`, which the shipped `sitemap.xml` actively advertises to search engines.
- **N+1 wishlist fetches.** Every `ProductCard` independently calls `GET /customer/wishlist` on mount. A 12-product shop page fires 12 identical requests. Wishlist belongs in Redux beside auth.
- **`inCart` is never derived from the cart.** It initialises to `false` on every mount, so a product already in the cart still reads "Add to Cart", and clicking again silently increments the quantity.
- **Client-side sort over a single page.** "Price: Low to High" sorts the 12 products currently loaded, not the catalogue. The backend accepts no sort parameter.
- **No search debounce** — one request per keystroke.
- **Redux holds only `auth`.** Cart, wishlist, and their badge counts are re-fetched per page, so the header shows no counts at all.
- **Inconsistent feedback.** Three systems in use: `react-hot-toast`, raw `alert()` in `CartPage`, and inline error strings in the review form. `react-toastify` is installed but never imported.
- **Debug logging ships to production** — `FilterSidebar.jsx:25` logs on every render, and it sorts on a `displayOrder` field that does not exist in the Category schema, so the sort is a no-op.
- **Role is trusted from `localStorage`.** Editing `smp_role` to `admin` renders the admin UI. The backend correctly rejects every call, so no data leaks — but the app shows a broken admin shell rather than denying access.
- **Bundle is 898 KB (265 KB gzip) in one chunk** — no route-level code splitting, and it carries recharts, swiper, two icon sets and an unused toast library.
- **Accessibility gaps** — icon-only header buttons without labels, emoji as the wishlist control, no visible focus styling, no `alt` discipline.
- **Lint fails: 25 errors.** Mostly two repeated React 19 patterns (calling a function in `useEffect` before its `const` declaration; synchronous `setState` in an effect) plus unused variables and an irregular whitespace character in `api.js:6`.

---

## G. Database & Data Model Audit

### What is modelled well

Ten focused models with sensible field-level validation (Indian mobile regex, GST and IFSC patterns, length bounds), timestamps throughout, a compound unique index enforcing one review per user per product, a static that recalculates product rating on write, and deliberate indexes on `Product.sellerId`, `Product.category`, a name/description text index, `Order.customerId`, `Order.items.sellerId`, and the Inventory log. The `Inventory` model recording `stockBefore` / `stockAfter` / `performedBy` shows real audit-trail thinking.

#### CRITICAL — The `Order` model cannot express multi-vendor fulfilment

A single order holds items from many sellers, but `status`, `trackingInfo`, `shippingAwb` and every shipping field are single-valued on the parent. Seller A marking their item shipped marks the whole order shipped for Seller B's items too, and overwrites B's courier details.

**Direction:** Introduce a per-seller sub-order — either an embedded `fulfilments[]` array keyed by `sellerId`, or a separate `SellerOrder` collection. The embedded option is the smaller change and fits the existing query patterns.

> *Evidence:* backend/models/Order.js:50‑61, 120‑156 · orderItemSchema.status is only 'active' | 'cancelled'

#### CRITICAL — `paymentStatus: 'completed'` is referenced in eight places and exists in none

The enum permits `pending | paid | failed | refunded`. Every refund guard and two analytics aggregations test for `'completed'`. The guards therefore never pass, and the aggregation clause is dead weight. A stale comment at `adminController.js:295` asserts the seller sets this value on delivery; the code at `sellerController.js:382` sets `'paid'`.

> *Evidence:* adminController.js:299,319,343 · customerController.js:348,358,547 · razorpayController.js:399 · sellerController.js:418

#### HIGH — Cancelling an order destroys its financial record

`cancelOrder` sets `order.totalAmount = 0` after cancelling. The order's value is permanently lost — history shows ₹0, and any future reconciliation or reporting over cancelled orders is impossible. Cancellation should change status, not erase the amount.

> *Evidence:* backend/controllers/customerController.js:403

#### HIGH — Cart prices are frozen at add-to-cart time and never revalidated

`Cart.items[].price` snapshots `product.price` on insert. Checkout builds the order from the cart, not from current product prices. A cart left open across a price change orders at the stale price — in either direction. Snapshotting is a reasonable pattern; failing to revalidate at checkout is not.

> *Evidence:* customerController.js:45 (write) → :206 (read, unchecked)

#### MEDIUM — Missing constraints and fields

`Product.weight` has a 0.1–30 kg range but no default and is not required, so shipping silently falls back to 0.5 kg. `Address.isDefault` has no uniqueness enforcement, so a user can have several defaults. `Product.sku` has no uniqueness. `Order` has no human-readable order number — customers are shown a raw ObjectId. `Order.refundStatus` declares an enum with `default: null`, which is not a member of that enum.

#### LOW — Product text index exists but is never used

`productSchema.index({name:'text', description:'text'})` is declared, but the public product search uses case-insensitive `$regex` across name, description, brand and tags. Regex search cannot use that index and will not scale.

> *Evidence:* models/Product.js:106 vs routes/productRoutes.js:101‑110

---

## H. API Audit

| Group | Base | Guard | Assessment |
|---|---|---|---|
| Auth | /api/auth | public + `/me` | Only 4 routes. No resend-OTP, forgot/reset password, logout, or refresh. |
| Public products | /api/public/products | none | Correct route ordering (`/categories/*` before `/:productId`). Verified 200. No sort param. |
| Customer | /api/customer | auth + customer | Broadest surface. Two debug routes left mounted; two dead controller exports. |
| Seller | /api/seller | auth + seller + status | Route ordering correct. `updateTracking` re-applies middleware already applied at router level. |
| Admin | /api/admin | auth + admin | Clean, but `GET /sellers/pending` returns *all* sellers. No order or user routes exist. |
| Reviews | /api/reviews | public GET, else customer | Well structured. |
| Inventory | /api/inventory | auth + admin\|seller | Single route, no tenant filter, no pagination. See Section J. |

### Cross-cutting API issues

- **Inconsistent response envelopes.** Some endpoints return `{success, data}`, some return bare objects, some return `{count, items}`. The frontend compensates with defensive fallbacks like `action.payload.user || action.payload`.
- **Inconsistent error shapes.** Most controllers catch and return `res.status(500).json({message: error.message})`, bypassing `errorMiddleware` entirely and leaking raw internal messages to clients regardless of `NODE_ENV`.
- **No API versioning** and no OpenAPI/Postman collection — nothing documents the 45+ endpoints.
- **Frontend/backend contract drift.** `orderService.checkoutOrder()` posts to `/customer/checkout`; the real route is `/customer/checkout-cod`. It happens to be unused — `CheckoutPage` calls the correct path directly — but the broken export is still exported.
- **CORS origins are hardcoded in source** rather than driven by `CLIENT_URL`, which is set in `.env` and then ignored.

---

## I. Authentication & Authorization Audit

### Sound foundations

bcrypt with a cost-10 salt via a pre-save hook that correctly skips unmodified passwords; `select: false` on password, OTP and OTP expiry; JWT signed with a 7-day expiry; `authMiddleware` re-loads the user from the database on every request rather than trusting token claims, and enforces `isVerified`; `roleMiddleware` is a clean factory handling both string and array inputs. Role escalation via registration is correctly blocked — `role === 'seller' ? 'seller' : 'customer'` makes `admin` unreachable from the signup form.

#### CRITICAL — Seller approval is never enforced

`checkSellerStatus` checks only `status === 'suspended'`. It never reads `isApproved`. Every seller route — add product, edit stock, view orders, update fulfilment — accepts a brand-new, unapproved seller. The frontend's "Account under review" screen is bypassed by typing the URL. This makes the platform's central trust mechanism non-functional.

> *Evidence:* backend/middlewares/checkSellerStatus.js:11 · compare models/Seller.js:43 isApproved

#### CRITICAL — Address mutation has no ownership check (IDOR)

`updateAddress` and `deleteAddress` resolve by `req.params.id` alone. Any authenticated customer can edit or delete any other customer's saved address by guessing or capturing an ID. `updateAddress` additionally passes `req.body` straight into the update, so `userId` itself can be rewritten.

> *Evidence:* backend/controllers/addressController.js:30 and :49 — no `userId: req.user._id` in the filter

#### HIGH — No account recovery, and no way out of an unverified account

There is no resend-OTP endpoint, no forgot-password, and no reset-password. A user whose OTP email is delayed, filtered, or simply missed is permanently locked out: login refuses them, re-registration refuses them, and refreshing the OTP page discards the email address it needs. This will silently cost real signups.

> *Evidence:* backend/routes/authRoutes.js — register, verify-otp, login, me

#### HIGH — No brute-force protection on login or OTP

No rate limiting, no lockout, no CAPTCHA. The OTP is a 6-digit number generated with `Math.random()` and valid for 10 minutes — roughly a million possibilities against an endpoint that accepts unlimited attempts. Password minimum is 6 characters with no complexity rule.

> *Evidence:* models/User.js:70 (Math.random) · authController.js:57 (unbounded verify)

#### MEDIUM — Token handling: localStorage, no revocation, no refresh

The JWT lives in `localStorage`, readable by any injected script. It is valid for 7 days with no server-side revocation — logout only clears the client. There is no refresh-token rotation, and no response interceptor to react to expiry.

#### MEDIUM — Orphaned user records on failed seller registration

`register` saves the User at line 29, then checks `businessName` at line 32. A seller signup missing a business name leaves a verified-pending user with no Seller profile and a permanently claimed email address.

> *Evidence:* backend/controllers/authController.js:29 vs :32

---

## J. Security Audit

*Ordered by real-world blast radius. Secret values were inspected but are deliberately not reproduced here — only variable names and key *modes*.*

> **The good news first**
>
> `.env` has **never been committed** — verified against the full history with `git log --all --diff-filter=A`. Both `.gitignore` files correctly exclude it. That is the failure mode this class of project usually hits, and this project avoided it.

#### CRITICAL — Payment verification can be replayed against an arbitrary order

`verifyRazorpayPayment` computes the HMAC over `razorpay_order_id|razorpay_payment_id` and compares it to the supplied signature. It then loads the order by the client-supplied `dbOrderId` and marks it paid. It never asserts that `order.razorpayOrderId === razorpay_order_id`, never scopes the lookup to `customerId: req.user._id`, and never compares amounts.

**Impact:** An attacker completes one genuine minimal payment, captures the valid triple, then replays it against any pending order — their own high-value order, or another customer's. The order is marked `paid`, stock is decremented and the confirmation email is sent. The same triple can be reused indefinitely; there is no replay guard.

**Direction:** Scope the lookup by customer, assert the razorpay order ID matches the stored one, verify the captured amount against `order.totalAmount`, and enforce single-use by rejecting orders already `paid`.

> *Evidence:* backend/controllers/razorpayController.js:244‑290 — no binding between signature and target order

#### CRITICAL — Live payment and infrastructure credentials sitting in a working directory

Both `RAZORPAY_KEY_ID` and `VITE_RAZORPAY_KEY_ID` are **`rzp_live_`** prefixed — real-money keys, not test keys — and `RAZORPAY_KEY_SECRET` is the matching live secret. Alongside them: MongoDB Atlas credentials, a Cloudinary API secret, a SendGrid API key, a Gmail app password, and Shiprocket account credentials. Twenty-four secrets in total, on a laptop, next to a codebase with a payment-bypass vulnerability.

**Compounding:** Atlas accepted a connection from this machine on first attempt, which strongly implies the network allowlist is `0.0.0.0/0`. The database is reachable by anyone holding that connection string.

**Direction:** Treat all 24 as compromised and rotate them. Switch development to Razorpay *test* keys and keep live keys only in the deployment platform's secret store. Restrict the Atlas allowlist. Add a committed `.env.example` listing names with empty values.

#### CRITICAL — Admin credentials hardcoded in a committed script

`createAdmin.js` is tracked in Git and creates an admin with a fixed email address and a hard-coded six-digit numeric password (value redacted from this report; it is on line 24 of that file), pre-verified. Anyone reading the public repository knows the admin username and password. If that account exists in the live database, the platform is fully compromised — and the repository is public on GitHub.

**Direction:** Change that account's password immediately, then rewrite the script to read credentials from environment variables and refuse to run without them.

> *Evidence:* backend/createAdmin.js:13, :24 — tracked in git ls-files

#### CRITICAL — Cross-tenant data exposure in inventory logs

`getInventoryLogs` executes `InventoryLog.find()` with no filter and returns the entire collection, populated with product names and customer identities, to any authenticated seller or admin. The seller-facing Inventory Logs page renders it directly, applying only client-side type and date filters.

**Impact:** Every seller can read every competitor's sales volume, stock levels, product catalogue and order flow. In a marketplace this is both a privacy breach and a commercially sensitive one.

**Direction:** Scope by the caller's own products for sellers; keep the global view for admins only. Add pagination while you are there.

> *Evidence:* backend/controllers/inventoryController.js:66 · frontend/src/pages/seller/InventoryLogsPage.jsx:23

#### CRITICAL — Address IDOR — read, modify, and delete across users

Covered in Section I. Restated here because it is a direct authorization bypass on personally identifiable data: names, street addresses, and phone numbers of other customers.

> *Evidence:* backend/controllers/addressController.js:28‑58

#### HIGH — Razorpay webhook signature can never validate

`express.json()` is registered at `server.js:11`, before the webhook route at `:28`. By the time the handler runs, `req.body` is a parsed object, and the handler computes its HMAC over `JSON.stringify(req.body)`. Razorpay signs the *raw request bytes*; a re-serialized object will not reproduce them. Every webhook is rejected with 400.

**Impact:** Two-sided. The safety net for "customer paid but the browser closed" never fires, so those orders stay `pending` forever with the money taken. And a genuine security control is inert — if the raw-body issue were fixed carelessly, comparing strings with `!==` rather than a timing-safe compare would leave a subtle side channel.

**Direction:** Mount `express.raw({type:'application/json'})` on the webhook path *before* `express.json()`, HMAC the raw buffer, and compare with `crypto.timingSafeEqual`. The handler also dereferences `req.body.payload.payment.entity` unguarded, which throws on non-payment events.

> *Evidence:* backend/server.js:11 vs :28 · razorpayController.js:363, :370, :375

#### HIGH — Weak, literal JWT secret

`JWT_SECRET` is a 50-character human-written English phrase (value redacted from this report), not a generated high-entropy value. Anyone who guesses or recovers it can mint tokens for any user ID and role — including `admin`, since `authMiddleware` trusts the signed `userId`.

**Direction:** Replace with 32+ bytes of cryptographic randomness. Rotating it invalidates all live sessions, which is acceptable and arguably desirable.

#### HIGH — No security middleware of any kind

Confirmed absent across the whole backend: `helmet`, `express-rate-limit`, `express-mongo-sanitize`, `hpp`, and any validation library (`zod`, `joi`, `express-validator`). No security headers, no rate limits on any endpoint, no operator-injection sanitisation, no schema validation at the boundary.

**Note:** Mongoose casting blocks the classic `{$gt:""}` login bypass on typed fields, so this is a hardening gap rather than a live injection hole — but the installed Mongoose 9.0.0 carries an advisory for *improper `$nor` sanitisation in `sanitizeFilter`* plus a prototype-pollution issue in update casting, which narrows that margin.

#### HIGH — Stock can be sold twice, or driven negative, on prepaid orders

`createRazorpayOrder` validates stock but does not reserve it. Between order creation and payment verification another customer can buy the same units. At verification, `stockAfter = stockBefore - quantity` is written with no floor — and because the schema enforces `min: 0`, `save()` throws a ValidationError, aborting the transaction. **The customer has been charged and the order stays pending.**

**Direction:** Reserve stock at order creation with a conditional atomic update, release it on failure or timeout, and re-check at verification with a clear refund path when reservation cannot be honoured.

> *Evidence:* razorpayController.js:54‑78 (validate only) → :292‑300 (unguarded decrement)

#### MEDIUM — Credential and internal-detail leakage through logs and errors

`shiprocketService.js:18‑23` logs the Shiprocket account email and password length on every token fetch. Most controllers return `error.message` directly to the client regardless of `NODE_ENV`, exposing internal structure. `roleMiddleware`'s 403 body echoes back `requiredRoles` and `yourRole`, mapping the authorization model for an attacker.

#### MEDIUM — Unvalidated base64 image uploads

Images arrive as base64 strings inside a JSON body under a 10 MB Express limit, uploaded synchronously in a loop. Five images at the client's 5 MB ceiling exceed the body limit (base64 adds ~33%), producing an opaque 413. There is no MIME sniffing beyond a `data:image/` prefix check and no per-seller quota. Sequential uploads inside the request risk platform timeouts.

> *Evidence:* server.js:11 · utils/cloudinary.js:20‑31 · sellerController.js:49‑54

#### LOW — CORS list hardcoded; debug routes exposed

Four origins are hardcoded at `server.js:15‑20` while `CLIENT_URL` sits unused in `.env`. `GET /api/customer/test` and `GET /api/customer/test-shiprocket` remain mounted in production, the latter marked "TEMP TEST ONLY - later delete".

---

## K. Broken or Suspicious Functionality

*Defects that are not security issues but produce wrong behaviour. Everything here was confirmed by reading the code path end to end.*

| Behaviour | What actually happens | Location |
|---|---|---|
| Refund on cancel / return | Guarded on `paymentStatus === 'completed'`, which the enum forbids. Never executes. Customer loses the money. | customerController.js:358, 547 |
| Low-stock cron email | `populate('sellerId')` yields a User, then the code reads `.userId` off it — always `undefined` → `findById(undefined)` → `null` → `continue`. Zero emails, ever, with a cheerful "✅ Low stock emails sent" logged. | jobs/cronJobs.js:21‑31 |
| Verified-buyer review check | `Order.findOne({customerId, status:{$in:['delivered','returned']}})` returns one arbitrary order, then searches *that* order for the product. With multiple delivered orders, genuine buyers are refused. Fails closed, so no false approvals. | reviewController.js:48‑64 |
| Reviewing an out-of-stock product | The product lookup requires `stock: {$gt: 0}`, so a sold-out product cannot be reviewed at all. | reviewController.js:37‑45 |
| COD shipping quote vs charge | Preview sends `paymentMethod:'cod'` → COD rate + COD fee. Checkout omits it → prepaid rate. The customer is shown one total and charged another. | CheckoutPage.jsx:205 · customerController.js:146 |
| Product weight on create | The form sends `weight`; `addProduct` never destructures it. Silently dropped. Only `updateProduct` persists it. | sellerController.js:33‑45 |
| Category edit | Any partial update writes `parentCategory: parentCategory \|\| null`. Toggling a subcategory's active flag promotes it to a root category. | adminController.js:226 · AdminCategoriesPage.jsx:58 |
| Return restocks twice | `returnOrder` loops all items with no `status === 'active'` guard, so an already-cancelled item is restocked a second time. | customerController.js:581‑589 |
| `cancelOrderItem` error handling | The sole `catch` is labelled "Partial refund failed" and reports that message for *any* failure. It also references `order`, declared with `const` inside the `try` — an early throw makes the catch itself throw. It can call `abortTransaction()` on an already-committed session. | customerController.js:509‑520 |
| Seller low-stock count | Analytics uses `stock < threshold`; the low-stock list uses `stock <= threshold`. Dashboard number and list length disagree. | sellerController.js:410 vs :221 |
| Seller product totals | `totalProducts` counts soft-deleted products; the product list filters them out. Another mismatched pair. | sellerController.js:403 vs :14‑17 |
| Subcategory ordering | `FilterSidebar` sorts by `displayOrder`, a field that does not exist on `Category`. Every value is `undefined`, so the sort is a no-op — and it `console.log`s on every render in production. | FilterSidebar.jsx:14‑29 |
| Unknown URLs | No catch-all route. Blank page, no 404, no navigation back — including for the `/cart` and `/checkout` URLs the sitemap advertises. | App.jsx:47‑89 · public/sitemap.xml |
| Weight migration script | Compares `product.category.toString()` — an ObjectId — against `'Footwear'`. Never matches; every product gets the same 0.5 kg default the "smart defaults" were meant to avoid. | migrateProductWeights.js:34‑42 |
| SEO files disagree with routes | `robots.txt` disallows `/cart` and `/checkout`; the real routes are `/customer/cart` and `/customer/checkout`, so nothing is actually disallowed. Meanwhile `sitemap.xml` submits those same non-existent URLs to crawlers. | public/robots.txt · public/sitemap.xml |

---

## L. Missing Features

### Essential — the product is incomplete without these

- **Password reset and OTP resend.** Non-negotiable. Their absence creates permanently locked accounts.
- **Enforced seller approval.** The advertised model does not function without it.
- **Working refunds.** Currently a legal and trust liability, not just a bug.
- **Admin order visibility.** An operator who cannot see orders cannot run a marketplace.
- **Order confirmation page and human-readable order numbers.** Checkout currently drops the user on a list; support conversations reference 24-character ObjectIds.
- **Working 404 and global 401 handling.**

### Valuable — clear, defensible improvements

- Server-side sorting on the product list (the current sort is misleading).
- Cart and wishlist counts in the header, backed by Redux rather than per-page fetches.
- Seller-scoped fulfilment: per-seller status and tracking on shared orders.
- Return approval flow — restock on receipt, not on request.
- Inline "add address" during checkout, replacing today's navigate-away-and-press-Refresh instruction.
- Order status timeline for the customer.
- Admin user management, and a way for sellers to view and restore deleted products.
- Real `.env.example` and a README that documents setup.

### Nice to have — genuinely optional

- Coupons and discounts, seller payout ledger, review images, product variants, recently-viewed, related products, invoice PDF, guest checkout, dark mode.

> **Deliberately not recommended**
>
> Real-time chat, recommendation engines, multi-currency, a mobile app, microservices, GraphQL, Kubernetes, Elasticsearch, an admin CMS. Each adds surface area and maintenance without addressing a single thing a client would actually question. The credibility gap here is correctness, not scope.

---

## M. Code Quality & Architecture

### Patterns worth preserving

The layered structure, transaction usage in checkout, the explicit fulfilment state machine, the inventory audit model, the service-module pattern on the frontend, and the centralised axios instance are all sound. None of these should be rewritten.

### Systemic issues

- **Copy-paste over abstraction.** The Shiprocket rate block appears three times; refund initialisation constructs a new Razorpay client inline in three places; wishlist and cart fetch logic is repeated across pages.
- **Comments that contradict the code.** `adminController.js:295` claims the seller sets `'completed'`; it sets `'paid'`. `razorpayController.js:285` says "optional: later rename to completed". These stale notes are how the eight-place enum mismatch survived.
- **Fear markers.** Three `DO NOT TOUCH THIS LOGIC (CRITICAL)` comments in `MyProductsPage.jsx` around image handling. They signal code the author could not reason about — and a reviewer reading the repository will read them the same way.
- **Oversized components.** `MyProductsPage.jsx` is 826 lines mixing form state, validation, image encoding, category cascade, search, sort, and two rendering modes. `ProductDetailsPage.jsx` is 527. `CheckoutPage.jsx` is 468.
- **Mixed languages in comments.** Hindi/Hinglish comments (`tumhare model ke hisaab se`, `sabse upar rakha hai`) sit alongside English. Fine privately; a reviewer will notice, and it undercuts the professional read.
- **Decorative emoji as structure.** ✅ markers throughout the backend read as changelog residue rather than documentation.
- **Inconsistent formatting.** Whole files indented four extra spaces (`User.js`, `Review.js`, `Inventory.js`, `shiprocketService.js`); mixed quote styles; an irregular whitespace character in `api.js`. No Prettier or EditorConfig.
- **Commit history.** Thirty consecutive commits named "done", "donee", "doneee", "donnee". This is the first thing a technical reviewer sees on GitHub, and it currently reads as unstructured work. History cannot be improved retroactively without a rewrite — but every future commit can.

---

## N. Dead, Duplicate & Suspicious Code

| Item | Finding | Recommendation |
|---|---|---|
| controllers/productController.js | 85 lines. Despite the name it is an Express router, never imported anywhere. An older, inferior duplicate of `routes/productRoutes.js` — its search covers only name and description. | Delete |
| orderService.checkoutOrder | Posts to `/customer/checkout`, which does not exist (the route is `/checkout-cod`). Exported, never imported. | Delete |
| sellerOrderService.js | Duplicates `getSellerOrders` and `updateOrderStatus`, already present in `sellerService.js`. | Merge |
| inventoryService.js | Duplicates `adminService.getInventoryLogs`. | Merge |
| reviewService.addOrUpdateReview | Self-described "OPTIONAL ALIAS" for `createOrUpdateReview`. Unused. | Delete |
| pickBestCourier | Exported from `shiprocketService.js`, imported by `customerController.js:9`, never called — the three inline copies do the work instead. | Use it or delete it |
| testShiprocketRate | Live route `/api/customer/test-shiprocket`, commented "TEMP TEST ONLY - later delete". | Delete |
| GET /api/customer/test | Public health stub returning `{ok:true}`. | Delete |
| applyInventoryChange | The intended stock helper, but cannot accept a transaction session, so every important caller hand-rolls the logic instead. Used in only two places. | Refactor to accept a session, then route all callers through it |
| `'completed'` analytics clause | `$in: ['paid','completed']` in three aggregations — the second value never occurs. | Remove |
| orderStatusEmail / newOrderEmail | Defined in `emailTemplates.js`, never used. Sellers are never notified of new orders. | Wire up or delete |
| .ck-content CSS | `index.css` styles CKEditor output; CKEditor is not a dependency. | Delete |
| SMTP_* / EMAIL_* env vars | Eight variables for Nodemailer/Gmail SMTP. All email goes through SendGrid; `nodemailer` is never required. | Remove vars and dependency |
| migrateProductWeights.js | One-off migration with broken category logic (see Section K). | Move to a `scripts/` folder or delete |
| frontend/README.md | Untouched Vite starter template. | Replace or delete |
| App.css | Zero bytes, still imported into the graph. | Delete |
| index.html favicon | References `/vite.svg`, which is not in `public/`. Broken favicon on the live site. | Add an icon |

---

## O. Dependency Audit

### Backend — 14 declared, 4 unused, 1 undeclared

| Package | Status | Note |
|---|---|---|
| express, mongoose, jsonwebtoken, bcryptjs, cors, dotenv | **REQUIRED** | Core. Mongoose 9.0.0 carries a high-severity advisory; 9.7.2+ resolves it. |
| cloudinary, razorpay, @sendgrid/mail, node-cron | **REQUIRED** | All actively used. |
| axios | **UNDECLARED** | Required by `shiprocketService.js`; absent from `package.json`. Resolves only via hoisting from `razorpay` / `@sendgrid/mail`. Add it explicitly. |
| stripe | **UNUSED** | Large SDK, zero references. Razorpay is the payment provider. |
| nodemailer | **UNUSED** | Never required. The README advertises it; SendGrid does the work. Carries 6 high-severity advisories. |
| multer | **UNUSED** | Uploads go through base64 JSON. 5 DoS advisories. |
| colors | **UNUSED** | Never required. |

Removing the four unused packages eliminates **11 of the 13 reported vulnerabilities outright** — including every `nodemailer` and `multer` advisory — with zero behavioural risk, because nothing imports them.

### Frontend — 18 declared, 5 unused, 0 vulnerabilities

| Package | Status | Note |
|---|---|---|
| react, react-dom, react-router-dom, @reduxjs/toolkit, react-redux, axios, tailwindcss, @tailwindcss/vite | **REQUIRED** | Core stack. |
| recharts | **REQUIRED** | Admin dashboard charts only — a strong code-splitting candidate. |
| swiper | **REQUIRED** | Two seller pages. |
| react-hot-toast | **REQUIRED** | The toast system actually in use. |
| lucide-react + react-icons | **REDUNDANT** | Two icon libraries for a handful of icons. Consolidate on one. |
| react-toastify | **UNUSED** | A second toast library, never imported. |
| @stripe/stripe-js + @stripe/react-stripe-js | **UNUSED** | Stripe is not integrated on either side. |
| date-fns | **UNUSED** | Never imported; dates are formatted with `toLocaleDateString`. |
| react-hook-form | **UNUSED** | All forms are hand-rolled `useState`. |

### Dependency risks

- **No committed frontend lockfile** — builds are not reproducible.
- **Everything pinned with `^`** on very recent majors (Express 5, Mongoose 9, React 19, Tailwind 4, Vite 7). The stack is modern, which is a genuine plus, but a caret range on a fresh major is where surprise breakage comes from.
- **Razorpay's checkout script is loaded from a CDN in `index.html`** with no SRI hash and no failure path beyond a toast.

---

## P. Test Coverage & Validation Gaps

**Existing tests: none.** No test files, no test framework, no CI configuration. `backend/package.json` has the npm default: `"test": "echo \"Error: no test specified\" && exit 1"`. For a project handling live payments, this is the single largest credibility gap after the security findings.

### Untested critical flows, in priority order

1. Payment verification — signature validity, order binding, ownership, amount match, replay rejection.
2. Webhook signature verification over a raw body.
3. Refund initiation on cancel and return.
4. Stock decrement, restoration, and the negative-stock guard under concurrency.
5. Authorization boundaries — every role against every route, plus the address IDOR and inventory-log tenancy.
6. Seller approval enforcement.
7. Order status transition legality.
8. Cart total arithmetic and shipping-charge composition.

### How to validate each area — cheapest sufficient method

| Area | Right method | Why not something heavier |
|---|---|---|
| Auth, roles, IDOR, tenancy | Supertest integration tests against the Express app | Pure HTTP contracts. A browser adds minutes per case and tests nothing extra. |
| Payment verification & webhook | Supertest with locally generated HMACs | You control the secret, so you can forge valid and invalid signatures deterministically — far better coverage than clicking through a real gateway. |
| Stock, refunds, transitions | Integration tests on a throwaway database | Needs a real Mongo for transactions; `mongodb-memory-server` does not support them, so point at a scratch Atlas database or local replica set. |
| Totals, filters, sorting | Plain unit tests on extracted pure functions | Extracting them is a refactor worth doing regardless. |
| Checkout & Razorpay modal UX | Browser-level — genuinely warranted | The one place it is justified: a third-party iframe, a callback handler, and a redirect that cannot be exercised any other way. |
| Everything else in the UI | Manual walkthrough | A three-role app of this size is faster to check by hand than to automate, and the automation would be brittle. |

**A realistic target:** roughly 30–40 integration tests covering auth, authorization boundaries, payment verification, and stock movement. That is a weekend of work, it directly proves the fixes in Section S actually hold, and "the payment flow has tests" is a sentence that materially changes how a client reads this project.

---

## Q. Portfolio Potential

*Read as if I were a prospective client with some technical judgement, spending twenty minutes on the repository and the live site.*

### What already reads as credible

- **Scope no tutorial provides.** Three genuine roles, three live third-party integrations, COD and prepaid, partial cancellation, returns, an inventory audit trail, live shipping rates. This is a real domain, modelled with real understanding.
- **It is deployed and it works.** A public URL with real products and working images beats any amount of README.
- **Modern, current stack** — React 19, Express 5, Mongoose 9, Tailwind 4, Vite 7. Not a 2021 tutorial.
- **Evidence of real engineering instinct** in specific places: transactional checkout, HMAC verification, a forward-only state machine, soft deletes, a webhook idempotency guard.
- **Indian-market fit** — Razorpay, Shiprocket, GST and IFSC validation, pincode-based rates. For Indian clients this is directly relevant experience.

### What currently reads as weak

- **The commit history is the first thing seen.** Thirty commits called "done" tells a reviewer more about working style than any code sample.
- **An empty README.** It ends mid-sentence at "### Backend" with no installation instructions. There is no `.env.example`, so nobody can run it.
- **Zero tests** on a payment system. This is the question a technical client asks first.
- **"DO NOT TOUCH THIS LOGIC (CRITICAL)"** in the source, three times.
- **Debug routes and `console.log`s in production code.**
- **Two toast libraries, an unused Stripe SDK, an unused Nodemailer** — reads as accumulation rather than curation.
- **Any reviewer who probes the payment flow finds the replay issue.** That is the difference between "junior but promising" and "cannot be trusted with money".

### Highest-impact improvements, ranked by credibility gained per hour

1. **Fix the payment and authorization defects.** Turns the most damaging discovery into a non-event.
2. **Write a real README** — architecture diagram, setup steps, `.env.example`, screenshots, demo credentials for each role, a live link. Highest ratio in the entire list; costs a day.
3. **Add integration tests for payments and authorization.** Converts "trust me" into "here is the proof".
4. **Make seller approval real.** Makes the multi-vendor claim true.
5. **Provide seeded demo accounts.** Most reviewers will never register three accounts and wait for OTP emails. Without demo logins they see the shop page and leave.
6. **Remove the dead code and unused dependencies.** A day's work; the repository reads as curated instead of accumulated.
7. **Adopt conventional commits from here on.** Free, and it changes the next reviewer's first impression.

> **What not to build**
>
> **Do not add features.** Not chat, not recommendations, not a mobile app, not microservices, not GraphQL, not TypeScript-everything as a rewrite, not Docker/Kubernetes, not an analytics warehouse. Every one of them increases surface area without answering the question a client is actually asking, which is *"can this person be trusted with my payment flow?"* A smaller, correct, well-tested, well-documented ShopMaster Pro is worth considerably more than a larger one with the same defects.

---

## R. Tool / MCP / Plugin Recommendation Audit

*Assessed against your stated principle — install less, understand more. Nothing here has been installed.*

#### Required now

#### REQUIRED — A test runner and HTTP assertion library — `vitest` + `supertest`

**Problem:** Zero tests on a payment system, and the Section S fixes touch money movement and authorization. Fixing them without tests means you cannot prove they work, or that they stay fixed.

**Why nothing else suffices:** Static inspection cannot demonstrate that a forged signature is rejected or that Seller B cannot read Seller A's logs. Manual curl checks are unrepeatable and will not run in CI.

**Why these:** Supertest drives the Express app in-process — no server, no ports, no browser. Vitest is already implied by the Vite toolchain, so no extra config language. Together they are two devDependencies.

**Alternatives:** Node's built-in `node:test` avoids one dependency but has weaker ergonomics; Jest is heavier and awkward with ESM. Neither replaces Supertest.

devDependency only permanent zero production cost no redundancy

#### REQUIRED — A schema validation library — `zod`

**Problem:** Every controller trusts `req.body`. This is the shared root cause of the address mass-assignment hole, unvalidated cart quantities, and the payment-verification payload accepting any `dbOrderId`.

**Why nothing else suffices:** Mongoose validates documents at save time, not requests at the boundary — and it cannot reject unexpected fields before they reach a spread. Hand-written `if` checks in 40+ handlers is exactly the duplication this codebase already suffers from.

**Alternatives:** `joi` and `express-validator` are equally valid; zod is smaller and its inferred types pay off if you ever move to TypeScript. Any one is fine — the point is having a boundary, not the brand.

1 dependency permanent ~60 KB

#### Useful when needed

#### USEFUL — `helmet` + `express-rate-limit`

Two small, well-established middlewares that close the entire "no security headers, no brute-force protection" finding in about ten lines. Needed at Phase 0/1, not before. No redundancy — nothing in the project does this today. Rate limiting on login, OTP verification, and registration is the part that matters most.

2 dependencies permanent negligible cost

#### USEFUL — Playwright — *only* for the Razorpay checkout path

**Where it is genuinely justified:** The prepaid checkout opens a third-party iframe, receives a callback into a JS handler, and then calls your verification endpoint. That specific sequence cannot be exercised by Supertest, and it is precisely the flow carrying your worst defect.

**Where it is not:** Everything else. Auth, roles, IDOR, tenancy, stock, refunds and totals are all HTTP-level and belong in Supertest, which runs in milliseconds instead of seconds and never flakes on a selector.

**Cost:** Browser binaries are a few hundred MB and CI runs get slower. Justified for one or two tests; not as a general strategy. The Playwright MCP tools are already available in this session, so nothing needs installing to explore the UI interactively — that is a reason to defer the dependency, not to add it.

devDependency defer to Phase 5 scope: 1–2 tests

#### USEFUL — Prettier + a GitHub Actions workflow

Prettier resolves the mixed indentation, quote styles, and the irregular whitespace character in one pass and prevents recurrence. A minimal Actions workflow running install → lint → test → build is roughly 25 lines of YAML, costs nothing on a public repository, and puts a green check on the README — which does real work for portfolio credibility. Both are worth doing once tests exist to run.

1 devDependency + 1 YAML file permanent free

#### Optional

- **`pino` or `winston`** — replaces ~60 `console.log`/`console.error` calls with levelled, structured logging and gives you a place to redact credentials. Real value, but well below the correctness work.
- **Sentry (free tier)** — silent failures are a recurring theme here (email swallowed, shipping falls back, cron does nothing). Error tracking would have surfaced several of these findings. Only worthwhile if the site is genuinely live.
- **TypeScript** — would have caught the `'completed'` enum mismatch, the `user._id` vs `user.id` confusion, and the dropped `weight` field at compile time. Genuinely valuable and a real portfolio signal, but a migration of this size is a Phase 6 project, not a fix.

#### Not needed

- **Documentation-fetching or web-crawling MCP servers** — Razorpay's signature and webhook contracts and Shiprocket's serviceability API are the only external references needed, and they are already understood from the integration code plus general knowledge.
- **A database GUI or MongoDB MCP** — the Mongoose models fully describe the schema, and a short Node script answers any data question. Adds a live-credential surface for no gain.
- **Docker / docker-compose** — a single Node service and a hosted Atlas database. Containerisation adds a moving part without solving a problem you have.
- **Storybook, Cypress, k6, an API mocking layer, a monorepo tool** — no problem in this audit requires any of them.
- **A second payment provider** — the unused Stripe SDK should be removed, not activated.

---

## S. Prioritized Roadmap

*Ordered by consequence, not by count. Phases 0–2 are the difference between a liability and a working product; Phase 3 is the difference between a working product and a persuasive portfolio piece.*

### Phase 0 — Contain the live exposure
*Hours · mostly outside the codebase*

**P0 · Rotate every credential and lock down the database**

- **Problem:** 24 live secrets — including live-mode Razorpay keys — sit in a working directory, and Atlas appears to accept connections from anywhere.
- **Root cause:** Development was done directly against production credentials; no test-mode split was ever established.
- **Involves:** `backend/.env`, `frontend/.env`, Razorpay / Atlas / Cloudinary / SendGrid / Shiprocket dashboards
- **Solution:** Rotate all keys. Move development to Razorpay *test* keys; keep live keys only in the deploy platform. Restrict the Atlas IP allowlist. Add a committed `.env.example` with names and empty values.
- **Impact:** Removes the largest real-world risk in the project.

*complexity: low · risk: none · code changes: only .env.example · worth doing: unconditionally*

**P0 · Neutralise the hardcoded admin account**

- **Problem:** A committed script creates an admin with a known email and a hard-coded six-digit numeric password in a public repository.
- **Involves:** `backend/createAdmin.js`
- **Solution:** Change that account's password in the live database now. Rewrite the script to read `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the environment and refuse to run without them.
- **Impact:** Closes a trivially exploitable full-admin takeover.

*complexity: trivial · risk: none · code changes: yes · depends on: nothing*

### Phase 1 — Payment and authorization integrity
*1–2 weeks · the core of the work*

**P1 · Bind payment verification to its order**

- **Problem:** A valid signature from any payment can mark any pending order as paid, repeatedly.
- **Root cause:** Signature validity was treated as sufficient; the link between the signed Razorpay order and the target database order was never asserted.
- **Involves:** `razorpayController.verifyRazorpayPayment`
- **Solution:** Scope the lookup with `customerId: req.user._id`; assert `order.razorpayOrderId === razorpay_order_id`; fetch the payment from Razorpay and verify its amount against `order.totalAmount`; reject orders already `paid`; use `crypto.timingSafeEqual` for the comparison.
- **Impact:** Eliminates the most severe defect in the project.

*complexity: medium · risk: medium — needs test-mode verification · code changes: yes · worth doing: non-negotiable*

**P1 · Repair the webhook so it can authenticate**

- **Problem:** The HMAC is computed over re-serialized JSON; every webhook fails, so paid-but-unconfirmed orders are never rescued.
- **Root cause:** `express.json()` is mounted before the webhook route. The commit "register webhook before auth middleware" shows the ordering issue was understood but the wrong middleware was reordered.
- **Involves:** `server.js:11,28`, `razorpayController.handleRazorpayWebhook`
- **Solution:** Mount `express.raw({type:'application/json'})` on the webhook path before `express.json()`; HMAC the raw buffer; timing-safe compare; guard `payload.payment.entity` before dereferencing.
- **Impact:** Restores the safety net for interrupted payments — the direct cause of "money taken, no order".

*complexity: low · risk: low · code changes: yes · depends on: nothing*

**P1 · Make refunds actually fire**

- **Problem:** Every refund path is guarded on a status value the schema forbids, so prepaid customers are never refunded.
- **Root cause:** An intended `paid` → `completed` rename was applied to the readers and never to the schema or the writers.
- **Involves:** `customerController.cancelOrder`, `returnOrder`, `adminController.getAnalytics`, `sellerController.getSellerAnalytics`
- **Solution:** Standardise on the enum's `'paid'` across all eight sites and drop the dead `'completed'` clause from the aggregations. Extract one `refundOrder()` helper instead of three inline Razorpay clients. Stop zeroing `totalAmount` on cancel. Wrap `cancelOrder` in a transaction like its sibling.
- **Impact:** Turns a financial and reputational liability into working behaviour.

*complexity: medium · risk: medium — touches money · code changes: yes · depends on: Phase 5 tests ideally written first*

**P1 · Scope inventory logs to the requesting seller**

- **Problem:** Every seller can read every other seller's stock movements and sales volumes.
- **Root cause:** The endpoint was written for the admin view and later reused for sellers without adding a tenant filter.
- **Involves:** `inventoryController.getInventoryLogs`, `inventoryRoutes.js`
- **Solution:** For sellers, resolve the caller's product IDs and filter on them; keep the unfiltered view for admins only. Add pagination and date-range filtering server-side rather than in the browser.
- **Impact:** Closes a cross-tenant breach and removes an unbounded query.

*complexity: low · risk: low · code changes: yes*

**P1 · Add ownership checks to address mutation**

- **Problem:** Any customer can update or delete any other customer's address, and can rewrite its `userId`.
- **Involves:** `addressController.updateAddress`, `deleteAddress`, `addAddress`
- **Solution:** Add `userId: req.user._id` to both filters. Whitelist updatable fields rather than passing `req.body`. Set `userId` after the spread, not before.
- **Impact:** Closes an IDOR on personally identifiable data. Roughly a ten-line change.

*complexity: trivial · risk: none · code changes: yes*

**P1 · Enforce seller approval**

- **Problem:** Unapproved sellers can list and sell; admin approval does nothing.
- **Root cause:** `checkSellerStatus` checks suspension only. The frontend gate created a convincing illusion that the rule was enforced.
- **Involves:** `middlewares/checkSellerStatus.js`, `sellerRoutes.js`, `adminController.approveSeller`
- **Solution:** Reject unapproved sellers on write routes (product create/update, stock, fulfilment) while allowing read-only dashboard access so the "under review" state still makes sense. Email the seller on approval and rejection.
- **Impact:** Makes the platform's central trust mechanism real — and makes the admin role meaningful.

*complexity: low · risk: medium — may lock out existing unapproved sellers · code changes: yes*

**P1 · Reserve stock for prepaid orders**

- **Problem:** Stock is validated but not held between Razorpay order creation and verification, so verification can fail after the customer has paid.
- **Involves:** `razorpayController.createRazorpayOrder`, `verifyRazorpayPayment`
- **Solution:** Decrement stock atomically at order creation with a conditional update, release it on failure, dismissal, or a timeout sweep. Re-check at verification with an explicit refund path when reservation cannot be honoured.
- **Impact:** Prevents the "charged but no order" outcome and stops stock going negative.

*complexity: high · risk: medium · code changes: yes · depends on: payment verification fix*

**P1 · Add security middleware and a validation boundary**

- **Problem:** No headers, no rate limits, no request validation anywhere.
- **Involves:** `server.js`, all route files, a new `middlewares/validate.js`
- **Solution:** `helmet()` globally; `express-rate-limit` on login, register, and verify-otp; zod schemas at the boundary of every mutating route, starting with cart, address, checkout, and payment verification.
- **Impact:** Closes a whole class of findings at once and removes the mass-assignment root cause.

*complexity: medium · risk: low · code changes: yes · adds: 3 dependencies*

### Phase 2 — Essential missing functionality
*1 week*

**P2 · Account recovery: resend OTP, forgot password, reset password**

- **Problem:** A missed OTP email permanently bricks an account, and a forgotten password has no remedy.
- **Involves:** `authController`, `authRoutes`, new frontend pages, `emailTemplates`, `User` model (reset token fields)
- **Solution:** Three endpoints with rate limits and hashed, short-lived tokens. Persist `tempEmail` to `sessionStorage` so the OTP page survives a refresh. Fix the register-order bug so a failed seller signup does not orphan a user.
- **Impact:** Removes the most user-hostile behaviour in the product.

*complexity: medium · risk: low · code changes: yes*

**P2 · Give the admin order oversight**

- **Problem:** The admin cannot see a single order, so disputes and refunds cannot be handled.
- **Involves:** `adminController`, `adminRoutes`, a new admin orders page
- **Solution:** Paginated, filterable order list; order detail; manual refund trigger reusing the Phase 1 `refundOrder()` helper.
- **Impact:** Makes the admin role operationally real rather than decorative.

*complexity: medium · risk: low · depends on: Phase 1 refund helper*

**P2 · Fix checkout total consistency and add an order confirmation page**

- **Problem:** The quoted COD total differs from the charged total, and checkout drops the user on a list with no confirmation.
- **Involves:** `CheckoutPage.jsx`, `customerController.checkout`, `previewTotals`, a new `OrderSuccessPage`
- **Solution:** Extract the triplicated Shiprocket block into one `calculateShipping()` service used by all three callers, and pass `paymentMethod` through on the COD path. Add a confirmation page and a short human-readable order number.
- **Impact:** Removes a billing discrepancy and closes the most conspicuous UX gap in the purchase flow.

*complexity: medium · risk: low · also fixes: 3× duplication*

**P2 · Fix the functional defects in Section K**

- **Problem:** Reviews refused for genuine buyers, low-stock cron silently dead, double restock on return, weight dropped on create, category edits un-parenting subcategories, mismatched low-stock counts.
- **Solution:** Each is a small, independent fix; the review entitlement query and the cron's `.userId` dereference are the two with real user impact.
- **Impact:** Removes the accumulated "small things that are wrong" that a reviewer will find one by one.

*complexity: low each · risk: low · count: ~10 fixes*

### Phase 3 — Portfolio credibility
*3–5 days · highest return per hour*

**P3 · Write the README the project deserves**

- **Problem:** The README ends mid-sentence at an empty "### Backend" heading. Nobody can run this project, and nobody can tell what it does.
- **Involves:** `README.md`, new `.env.example` files, screenshots, `frontend/README.md` (delete the Vite template)
- **Solution:** Problem statement, architecture diagram, feature list by role, full setup instructions, environment variable table, screenshots or a short walkthrough recording, live demo link, and demo credentials for all three roles. Be explicit about what is and is not production-hardened — stated limitations read as judgement, discovered ones read as oversight.
- **Impact:** The single highest-leverage change available. Most reviewers never get past the README.

*complexity: low · risk: none · code changes: docs only · worth doing: absolutely*

**P3 · Seed a demo dataset with credentials for each role**

- **Problem:** Evaluating the app requires registering three accounts and waiting on OTP emails. Most people will not.
- **Solution:** One idempotent seed script producing an admin, two approved sellers, a customer, products with images, and orders across every status — so charts and dashboards have something to show. Publish the logins in the README.
- **Impact:** Converts "a shop page" into "a reviewable product" in under a minute of a reviewer's time.

*complexity: low · risk: none · reuses: seedCategories.js pattern*

**P3 · Remove dead code and unused dependencies**

- **Problem:** 16 dead or duplicated items; 9 unused packages across both sides; debug routes and `console.log`s in production code.
- **Solution:** Delete the items in Section N. Declare `axios` explicitly. Commit the frontend lockfile. Remove the three "DO NOT TOUCH" comments once you have understood and tidied the image logic they guard.
- **Impact:** Eliminates 11 of 13 backend vulnerabilities and makes the repository read as curated rather than accumulated.

*complexity: low · risk: low — verify each is truly unreferenced · code changes: deletions*

### Phase 4 — Code quality and reliability
*1 week*

**P4 · Introduce a service layer for the duplicated logic**

- **Problem:** Shipping calculation appears three times with divergent inputs; refund initialisation three times; stock mutation four times.
- **Solution:** `services/shippingService.js`, `services/paymentService.js`, and a session-aware `services/inventoryService.js` that finally makes `applyInventoryChange` usable inside transactions — routing every stock mutation through one place.
- **Impact:** Removes the structural cause of the quote-vs-charge bug and the incomplete audit trail.

*complexity: medium · risk: medium — refactor of paid paths · depends on: Phase 5 tests*

**P4 · Fix frontend session handling and add a 404 route**

- **Solution:** Add an axios response interceptor that clears the token and redirects on 401. Add a catch-all route with a real not-found page. Move cart and wishlist into Redux, eliminating the N+1 fetches and enabling header badge counts. Derive `inCart` from actual cart state.
- **Impact:** Fixes the most visible day-to-day UX defects and removes 12 redundant requests per shop page.

*complexity: medium · risk: low*

**P4 · Clear the lint backlog and add Prettier**

- **Solution:** Resolve all 25 errors, add Prettier with a shared config, normalise the over-indented files, remove production `console.log`s, and replace the raw `alert()` calls in `CartPage` with the existing toast helpers.
- **Impact:** A clean `npm run lint` is a small but real signal, and it makes the next reviewer's diff readable.

*complexity: low · risk: low · adds: 1 devDependency*

**P4 · Split the multi-vendor order model**

- **Problem:** One seller's fulfilment action changes the order for every other seller in it.
- **Root cause:** Order status and tracking were modelled as single fields before multi-vendor fulfilment was considered.
- **Solution:** Add a `fulfilments[]` array keyed by `sellerId`, each with its own status and tracking. Derive the customer-facing order status from its members. Requires a migration for existing orders.
- **Impact:** The deepest correctness fix available, and the one that most substantiates the "multi-vendor" claim. Also the highest-risk item here — schedule it only after tests exist.

*complexity: high · risk: high — data migration · depends on: Phase 5 · worth doing: yes, but not first*

### Phase 5 — Testing and CI
*Weekend · ideally overlapped with Phase 1*

**P5 · Integration tests for auth, authorization, payments and stock**

- **Problem:** Zero tests on a payment system, and the Phase 1 fixes cannot otherwise be proven.
- **Solution:** Vitest + Supertest against a scratch database. Roughly 30–40 tests: every role against every route, the address IDOR, inventory-log tenancy, forged and replayed payment signatures, webhook raw-body verification, refund initiation, stock decrement and restoration, and order transition legality.
- **Impact:** Proves the fixes hold, prevents regressions, and materially changes how a client reads the project.

*complexity: medium · risk: none · adds: 2 devDependencies · write these alongside Phase 1*

**P5 · CI, plus one browser test for the payment modal**

- **Solution:** A GitHub Actions workflow running install → lint → test → build on push. Add a single Playwright test covering the Razorpay checkout modal and its callback — the one flow that genuinely cannot be tested at the HTTP layer.
- **Impact:** A green badge on the README, and coverage of the last untestable gap.

*complexity: low · risk: none · cost: free on public repos*

### Phase 6 — Optional enhancements
*Only after everything above*

**P6 · Considered, in rough order of value**

- **Worth it:** Server-side product sorting; route-level code splitting (recharts and swiper are prime candidates for the 898 KB bundle); structured logging; a return approval flow that restocks on receipt rather than on request; seller-facing new-order emails using the templates that already exist.
- **Maybe:** A TypeScript migration — it would have caught three of the bugs in this report at compile time and is a genuine portfolio signal, but it is a project in its own right.
- **Skip:** Coupons, product variants, chat, recommendations, multi-currency, a mobile app, microservices, GraphQL, containerisation. None of them close a gap identified in this audit.

---

### If you only do one thing

Phase 0 plus the five Phase 1 P1 items. That is roughly two weeks and it converts the project from *a system with a payment bypass, a cross-tenant leak, and refunds that silently never happen* into *a working, defensible marketplace*. Everything after that is about presentation — and presentation only pays off once the substance is sound.

---

*Findings are drawn from complete reads of all 91 source files, a fresh-clone install of both packages, a live backend boot with API probes against the production database, a production frontend build, and a full lint pass. No source file, configuration file, or Git state was modified. Awaiting your direction on which phase to begin.*
