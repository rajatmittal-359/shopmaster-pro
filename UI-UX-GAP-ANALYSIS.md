# UI/UX Gap Analysis

**Date:** 5 September 2026
**Method:** endpoint-to-UI diff from the code (free), then a real browser pass —
a genuine form login as **customer**, **seller** and **admin** in turn, plus the
anonymous visitor view. 14 screenshots, console errors captured.

**Pages actually opened:** anonymous shop · customer shop, cart, orders, order
details, checkout · seller dashboard, orders, my products · admin dashboard,
manage sellers, manage categories · login.

Nothing here is guessed from reading code alone; every finding was either
measured against the API or seen on screen.

---

## 1. The biggest gap: a whole feature has no UI

Fourteen backend endpoints exist that **no page in the app ever calls**:

| Feature | Endpoints with no UI | What it means in practice |
|---|---|---|
| **Payouts (admin)** | `GET /admin/payouts/payable`, `GET /admin/payouts`, `POST /admin/payouts`, `PATCH /:id/paid`, `PATCH /:id/failed` | Admin cannot see who is owed money, cannot create a payout, cannot mark one paid or failed |
| **Earnings (seller)** | `GET /seller/earnings` | A seller has no idea what they have earned or when they will be paid |
| **Bank details (seller)** | `GET`/`PATCH /seller/payout-details` | A seller cannot enter their bank account |
| **Orders (admin)** | `GET /admin/orders`, `GET /admin/orders/:id` | Admin cannot open a single order in the UI |
| Low stock (seller) | `GET /seller/products/low-stock` | Dashboard shows the count but there is no list to act on |

**This is why the `payouts` collection is empty.** The most financially
important code in the repo — 351 lines plus a dedicated test file, all working —
is unreachable from the website.

Worse, it is a **deadlock**: `utils/payout.js` refuses to create a payout for a
seller with no bank details, and there is no screen where a seller can enter
them. So even with an admin UI, no third-party seller could ever be paid.

**For a marketplace that charges commission, this is the gap to close first.**

---

## 2. Anonymous visitor — the SEO landing experience

This is who arrives from Google, and it is the weakest screen in the app.

| Problem | Detail |
|---|---|
| **No navigation at all** | The sidebar is wrapped in `isLoggedIn &&` ([Layout.jsx:44](frontend/src/components/common/Layout.jsx#L44)). A visitor gets no menu, no category links, nothing |
| **A dead control** | The `✕` button top-left still renders and toggles the empty sidebar. It does nothing visible |
| **No brand anywhere** | "ShopMaster Pro" only appears inside the logged-in sidebar. An anonymous visitor sees a header that just says "Shop" — no logo, no shop name |
| **No footer** | No About, Contact, Returns, Privacy. These are also a hard Google Merchant Center requirement |

You are working hard on SEO so that strangers land on these pages. Right now
they land somewhere with no identity and no way to browse.

---

## 3. Content quality — visible on every product card

Seen on the shop grid:

- **Product images do not match the products.** "Oudh Attar Roll-On" shows a
  tree. "Macrame Wall Hanging" shows a crowd of people in a room. "Copper
  Serving Tray" shows chess pieces. "Ubtan Gel Face Wash" shows a henna hand.
  "Marble Ganesha Showpiece" shows mirrored furniture.
- **Every description is the same sentence**: *"<Name> - carefully selected and
  finished to a high standard, dispatched by <seller>."* Fifty products, one
  description template. That is duplicate content sitewide — actively harmful
  for the search rankings you are chasing, and unconvincing to a shopper.
- **The seller is shown as a person's name** ("Seller: Sneha Kapoor") rather
  than the business name the seller profile already stores.

Seeded data is fine for development, but this is the live site on a live domain
that Google is crawling.

---

## 4. Per-role gaps

### Customer

| Finding | Severity |
|---|---|
| **"Return Order" shows on an order whose return window closed.** Order SMP-260818 was delivered 18 Aug; the window shut on 29 Aug. The button is rendered on `order.status === 'delivered'` alone ([OrderDetailsPage.jsx:269](frontend/src/pages/customer/OrderDetailsPage.jsx#L269)). Clicking it now returns a 400 from the backend | **High** — this is backend logic breaking the UI |
| **"Checkout" is a sidebar nav item.** Checkout is a step in the cart flow, not a destination. With an empty cart it is a dead end. No real store does this | Medium |
| **Order item thumbnails are broken** on My Orders and Order Details — a generic placeholder shows instead of the product image | Medium |
| **No tracking shown to the customer** — AWB and courier are stored on the order but never displayed | Medium |
| "My Cart (1 items)" — says 1 item while quantity is 2, and the grammar is wrong | Low |
| No invoice or receipt download | Low |
| Dates render as `8/30/2026, 1:19:49 PM` — US format, with seconds | Low |

### Seller

| Finding | Severity |
|---|---|
| **No Earnings, no Payouts, no Bank details, no Profile page.** The seller's whole money side is missing from the nav | **High** |
| **"Total Products 17" and "Active Products 17" are the same query.** Both call `{ sellerId, isActive: true }` ([sellerController.js:21](backend/controllers/sellerController.js#L21)), so "active" can never differ from "total" — the two cards will always agree, whatever the seller does | **High** |
| **Revenue is shown gross.** The dashboard's ₹5,751 and the per-order "Your Revenue (Items)" are item value before commission. A seller on 8% will be told a number 8% higher than they will receive | **High** |
| **Split orders are not marked as split.** The API now returns `isSplitOrder` and `orderStatus`, but the order card shows neither. A seller cannot tell that another seller shares the order | Medium |
| No "orders needing action" count — the single most useful number for a seller | Medium |
| A grey 3-dot stepper renders under each order with no active state — it looks broken | Low |
| Customer email is shown in full to the seller | Low (privacy) |

### Admin

| Finding | Severity |
|---|---|
| **No Orders page and no Payouts page** in the nav, despite both existing in the backend | **High** |
| **"Platform Revenue ₹18,496" is not platform revenue.** It is gross order value (GMV). The platform's actual take is the commission — a fraction of it, and ₹0 on your own shop's sales. As the business owner this is the number you would most easily misread | **High** |
| **"Orders Today: 10 / Last 24 hours" is false.** The backend returns `Order.countDocuments()` — every order ever. The real orders span 4–30 August; none are from the last 24 hours | **High** |
| **React key warning in the console** on the dashboard render | Medium |
| "Last 7 Days Revenue" renders an empty ~380px box saying "No revenue data" | Low |
| No product moderation anywhere — an approved seller's listing goes live instantly and admin cannot take a single one down | **High** (already noted in the architecture review) |

### Checkout — the money screen

Structurally the best-designed page in the app: numbered steps, real courier
names, live delivery quotes, a clear total. Three real problems though:

| Finding | Severity |
|---|---|
| **Same-day delivery is CHEAPER than standard, and standard is pre-selected.** Observed: Standard ₹152 (DTDC Surface) vs Same-day ₹45 (Borzo). The default costs the customer ₹107 more for slower delivery. Either the ordering/defaulting logic should pick the best value, or the pricing needs looking at | **High** |
| **"Same-day Delivery" promised "Tomorrow by 12:49 am".** The option label and the promise contradict each other. `describeArrival` correctly says "Tomorrow", but the option is still titled Same-day | **High** — it is a promise you cannot keep |
| **Borzo balance is ₹0**, so if a customer picks same-day the booking fails at the courier. The option is offered but cannot be fulfilled today | **High** (ops, not code) |
| **The address step tells the user to do the app's job**: *"Click Manage addresses to add or edit, then come back here and press Refresh to see the latest list."* A checkout should let you add an address inline, without leaving and manually refreshing | Medium |

### Seller — My Products

| Finding | Severity |
|---|---|
| **A ₹1 test product is live in the public catalogue.** "TEST Rupee One Nose Pin", ₹1, stock 25 — visible in the shop and listed in `sitemap.xml` as `test-rupee-one-nose-pin-6d565d`. A real customer can buy it | **High** |
| **Name and description disagree** — the product is called "TEST Rupee One Nose Pin" while its description says "Stone Studded Nose Pin" | Medium |
| **No active/inactive indicator on the cards.** Combined with the total/active counting bug, the seller has no way to see or manage which products are visible | Medium |
| No low-stock badge on the cards, so the dashboard's "6 low stock" cannot be acted on from here | Low |

### Admin — Manage Sellers

The **best page in the app**: tabs with counts, business names as headings,
status badges, and actions that change with state (Approve/Reject for pending,
Suspend for active).

It also proves the dashboard is wrong: this page says **All (5)**, the dashboard
says **Total Sellers 4**. Two screens, two answers for the same question.

| Finding | Severity |
|---|---|
| **The commission rate cannot be seen or changed here.** Per-seller commission is your entire business model — 0% for your own shop, 8% default, and Karan Bhatia is already on 6%. Today that rate is only editable directly in the database | **High** |
| No seller detail view — GST number, bank details, KYC status and their products/orders are not reachable from here | Medium |
| Nothing marks Charming Jewels as your own shop (`isPlatformOwned`), so it looks like any other seller | Medium |
| "Approve" is green — a sixth button colour in the app | Low |

### Admin — Manage Categories

| Finding | Severity |
|---|---|
| **The hierarchy is invisible.** 40 categories (10 main, 30 sub) render as one flat alphabetical list, so a subcategory sits above its own parent. The parent is only mentioned inside the description text ("part of Jewellery") | **High** — this is unmanageable as it grows |
| **No rename and no re-parent.** Only Deactivate and Delete are offered, although the backend supports `PATCH /admin/categories/:id` | Medium |
| **Hinglish developer text left in the UI**: *"Main category banane ke liye upar wala option chhodo. Subcategory ke liye parent select karo."* Fine while you are the only admin, out of place the moment anyone else uses it | Medium |
| No product count per category, so there is no way to know what a Delete would affect | Medium |
| Category descriptions are auto-generated boilerplate — the same duplicate-content problem as the products, and these feed your category landing pages | Medium |

### Everyone — login

- **No "Forgot password?" link, and no backend endpoint for it.** `authRoutes.js`
  has register, verify-otp, resend-otp, login, me — and nothing else. A customer
  who forgets their password is locked out permanently.
- No password show/hide toggle, no branding on the page, no way back to the shop.

---

## 5. Visual consistency

The app is orange. These break it:

| Where | Problem |
|---|---|
| Order Details | **"Return Order" is purple** — the only purple in the app |
| Seller order card | Three buttons in three colours — blue "View Full Details", green "Book courier & ship", orange "Mark as processing". No hierarchy: which is primary? |
| Seller dashboard | "Quick Actions" are orange, blue and black — same problem |
| Order status | Shown as a coloured **badge** on the orders list, but as plain text `Status: Delivered` on order details |
| Page titles | Only `/shop` and product pages set a title; every other page is "ShopMaster Pro" in the browser tab |

**One rule fixes most of this:** orange = the primary action on the screen,
white/grey outline = secondary, red = destructive. Nothing else gets a colour.

---

## 6. Faltu — safe to delete

| Item | Why |
|---|---|
| `orderService.checkoutOrder()` | Calls `POST /customer/checkout`, **an endpoint that does not exist** (the real ones are `/checkout-cod` and `/checkout-online`). Nothing imports it. Dead on arrival |
| `GET /customer/test` | A debug endpoint (`res.json({ok:true})`) sitting in the production API |
| `GET /public/products/categories/tree` | No caller anywhere in the frontend |
| The `✕` sidebar toggle when logged out | Toggles a sidebar that is not rendered |
| "Checkout" sidebar link | Duplicates the cart's "Proceed to Checkout" and is a dead end when the cart is empty |

---

## 7. One consistency issue worth fixing early

Most pages call the API through `services/`. Two do not:

- `CheckoutPage.jsx` calls `api.post('/customer/checkout-preview')`,
  `/checkout-online`, `/verify-payment`, `/checkout-cod` directly
- `AdminCategoriesPage.jsx` calls `/admin/categories` directly

So "where are the checkout API calls?" is not answerable from `services/`. This
is the same class of problem as `productRoutes.js` on the backend — most of the
code follows a pattern, and a couple of files quietly do not.

---

## Suggested order

| # | Fix | Effort | Why |
|---|---|---|---|
| 0 | **Deactivate the ₹1 "TEST Rupee One Nose Pin"** and regenerate the sitemap | 5 min | It is buyable by a real customer right now |
| 0 | **Sort out same-day pricing/labelling at checkout**, or hide same-day until Borzo is funded | 1 hr | You are defaulting customers to the more expensive, slower option and promising a same-day that arrives tomorrow |
| 1 | Hide "Return Order" once the window closes (backend sends `canReturn` + `returnWindowClosesAt`) | 1 hr | Backend logic is currently breaking the UI |
| 2 | Fix the three lying numbers: seller active/total, "Platform Revenue", "Orders Today" | 2 hrs | You make decisions from these |
| 2 | Show and edit **commission rate** on Manage Sellers | 2 hrs | It is your business model and it is database-only today |
| 3 | Seller: Earnings + Bank details pages | half day | Unblocks the payout deadlock |
| 4 | Admin: Payouts page (payable list → create → mark paid) | 1 day | Makes the whole settlement feature reachable |
| 5 | Show the sidebar/nav + footer to anonymous visitors | half day | Your SEO landing experience |
| 6 | Real product images and real descriptions | ongoing | Duplicate content is hurting the rankings you want |
| 7 | Colour rule: one primary action per screen | 2 hrs | Removes most of the inconsistency at once |
| 8 | Delete the dead code in §6 | 30 min | Free |
| 9 | Admin Orders page, forgot-password flow | 1 day | Completes the roles |

Items 1 and 2 are the ones that are actively wrong today. Item 3 and 4 are what
turn this from a shop into a marketplace that can actually pay its sellers.
