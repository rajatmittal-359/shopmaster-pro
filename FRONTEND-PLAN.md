# The new front end — what we are building, and why

**Decided:** 7 September 2026
**Stack:** Next.js 16.3.4 · React 19.2.8 · Tailwind v4 · shadcn/ui (Base UI, Nova) · JavaScript
**Lives in:** `web/` — `frontend/` keeps serving the site until cutover

This document is the decision record. It is written so that building each page
is a matter of following it, not re-arguing it. Everything below is either
measured from this codebase, quoted from a primary source, or marked as a
judgement call.

---

## 1. Why we are doing this at all

One sentence: **Google Merchant Center will not read structured data that
JavaScript creates.**

Google's own words, from [Set up structured data for Merchant
Center](https://support.google.com/merchants/answer/7331077):

> "Structured data markup must be present in the HTML returned from the web
> server. The structured data markup **can't be generated with JavaScript**
> after the page has loaded."

Googlebot-for-Search *does* render JavaScript, so the same markup can be visible
to Search and invisible to Shopping. That is the trap the shop is in today.

And the AI crawlers are worse. Vercel + MERJ instrumented real traffic and found
**GPTBot, ClaudeBot, PerplexityBot and Meta's crawler execute no JavaScript at
all** — GPTBot fetches JS files 11.5% of the time and never runs them. Only
Googlebot and AppleBot render. So a client-rendered product page gives ChatGPT
and Claude an empty `<div id="root">` and nothing else.

*(That study is from late 2024 and has not been re-run at the same scale. 2026
re-tests by EdgeComet and Wislr reach the same conclusion on smaller samples.
Direction: solid. Dates: stale.)*

**So: the nine public pages get server-rendered HTML. That is the whole point.**
The thirty private pages stay client-side, which is correct anyway — the auth
token lives in `localStorage` and no server can read it.

---

## 2. What is wrong today, measured

Found in this repo, not assumed:

| | Fault | Consequence |
|---|---|---|
| 🔴 | **Sorting is a lie.** `routes/productRoutes.js` hard-codes `.sort({createdAt:-1})` and takes no sort param. `HomePage.jsx:136` then re-sorts *only the current page*. | "Price: low to high" shows the cheapest of 12, not the cheapest of 51 |
| 🔴 | **No delivery date anywhere.** `utils/shipping.js` has `getDeliveryOptions()` but no public endpoint exposes it | All seven Indian jewellery sites we studied show a pincode delivery check above the fold. We have the data and hide it |
| 🔴 | **Feed is missing `color`, `gender`, `age_group`** — required by Google for free listings in category 166, which is where jewellery sits | 17 products sitting in "Under review" |
| 🟡 | **`/` is a redirect to `/shop`.** There is no home page | The strongest page on most sites does not exist here. Search Console's "Page with redirect: 2" is partly this |
| 🟡 | Product page has no breadcrumbs, no related products, no sticky mobile buy bar | All seven competitors have all three |
| 🟢 | Product page bones are sound — gallery with the video first, name, rating, price, quantity, trust, description, reviews | Structure survives; presentation changes |
| 🟢 | UI kit is six primitives (Badge, Button, Card, EmptyState, Modal, StatCard) | Small enough that shadcn replaces it cleanly |

---

## 2a. Who to look at, for what — the reference map

Rajat's point, 9 Sep 2026: he names the shops he knows; choosing the right
references is my job, not his. So this is written down once, with what each one
is actually good for and which ones are **not** worth copying for a shop this
size.

### The ones we take from, and what for

| Reference | Take this | Do NOT take |
|---|---|---|
| **Amazon (India)** | Seller Central's shape - Orders → Catalogue → Payments → Returns → **Account Health**; a published category-wise fee schedule; one account that buys and sells | Its intermediary category pages and its density. Amazon's answers assume millions of SKUs |
| **Flipkart** | Cancellation and return flows built on **named reasons** with "my reason is not listed"; a published rate card | Separate buyer and seller identities - it is their scale that forces that |
| **Meesho** | Payments as a first-class seller screen: settlement schedule, TDS, reconciliation against bank credits. And **RTO as a metric that has consequences** | The 0% commission model. It is funded by ads and logistics margin we do not have |
| **Myntra** | Size selection and the returns experience on apparel | Its scale-only features - lookbooks, try-ons |
| **Etsy** | The account model in one sentence: *"You'll use this account to run your shop and to buy from other makers"*. **Seller identity is a page**, with a rating and a story | Its handmade-only policy framing |
| **eBay** | Feedback on the SELLER, not only the product, and the **verified-purchase label** on it | Auctions, and the reputation complexity underneath |
| **GIVA, Tanishq** | Jewellery photography and product-page trust cues - materials, plating, care | Anything about sellers. They are single-brand shops with none |
| **Sharetribe / Mirakl** | What the OPERATOR's panel owes: approvals, commission, disputes, payouts, oversight. And the metric that matters early - **liquidity** | Their enterprise scope |
| **Baymard** | The only source here that is research rather than observation: category pages, filters, tracking, returns, images | Nothing - but check whether a finding is about large catalogues or small ones. They differ, and twice the answer for us was the opposite of the headline |

### What that reading says about a marketplace at OUR stage

Three findings keep repeating across the marketplace guides, and all three are
about the beginning, not scale:

1. **Liquidity first, and liquidity comes from a niche.** The advice is to be
   deep in one thing before being wide in many. We are the opposite shape right
   now - 51 products across nine categories, with 17 in jewellery. The catalogue
   should get *deeper* where we already have sellers rather than wider.
2. **Trust is the hardest thing a new marketplace buys, and reviews are how it
   buys it.** Verified-purchase flags are named specifically. We have reviews
   and no flag.
3. **Write the seller rules before the first outside seller goes live** -
   quality guidelines, performance expectations, and how disputes are decided.
   Doing it after the first argument is both a customer problem and a legal one.
   Rahul is the first outside seller. This is now, not later.

### What we are missing, in the order it costs us

| Gap | Why it matters | Size |
|---|---|---|
| **Verified-purchase badge** | Named by every trust source. `Review` has no flag, so an honest review looks the same as an invented one | Small |
| **A seller has no page** | Etsy and eBay both make the seller a place you can visit, with a rating. We print a name on a product and nothing else - in a marketplace that is where trust is supposed to accumulate | Medium |
| **Seller rules, written** | We enforce them in code (approval, suspension, disputes) with nothing a seller can read first | Small, and mostly writing |
| **Seller performance / RTO** | Meesho demotes on RTO; we do not measure it at all | Medium |
| **Buyer protection, said plainly** | Our returns policy is good and is filed under "policy". Marketplaces say it on the product page, where the doubt is | Small |
| **Buyer-seller messaging** | Etsy and eBay both have it | Large - not now |

---

## 3. Decisions, with the reason attached

### 3.1 JavaScript, not TypeScript
The whole codebase is JS; thirty private routes have to be ported by hand on
weekends. shadcn supports JS natively (`"tsx": false` in `components.json`
writes `.jsx`), so the usual argument for TS does not apply. TS can arrive later,
file by file — Next.js runs both.

### 3.2 Base UI, not Radix
shadcn's own CLI marks Base UI "(Recommended)" and its new components and docs
are written against it. Fighting the recommended path costs more than it saves
at one day a week.

### 3.3 Cache Components (`use cache`) — **OFF**
It is stable and unprefixed in Next 16, and we are still not turning it on:

- **Memory leak #97776** — `use cache` leaks ~84–150 MB/hour, OOM at ~18.5h.
  Broken in 16.3.0 and 16.3.2, fixed only in 16.4.0-canary.1. **Not backported
  to 16.3.x**, which is what we run.
- **#86577** — `<Activity>` keeps hidden routes mounted, so dropdowns and
  dialogs stay open across navigation. That is a direct hazard to a
  shadcn/Base UI interface.
- Next's own docs note that with Cache Components enabled, crawlers get the page
  rendered dynamically rather than from the shell — *"a page that loads for a
  person can fail to render for a crawler."* That is the exact opposite of what
  this migration is for.

Without it, `export const revalidate`, `generateStaticParams`, `revalidateTag`
and the rest all still work. Next's docs call this the "Previous Model" and
maintain it. **Revisit at 16.4.**

### 3.4 Rendering strategy per route

| Route | Strategy | Why |
|---|---|---|
| `/products/[slug]` | `generateStaticParams` + `revalidate` | 51 pages, static HTML, best TTFB. Price and stock refresh on revalidate |
| `/shop` | Server-rendered per request | Filters and sort are query params; caching them all is pointless at 51 products |
| `/` | Static, revalidated | Content changes rarely |
| 6 policy pages | Fully static | They change when we change them |

**`revalidateTag` now takes two arguments** in Next 16 — `revalidateTag('products', 'max')`. The one-argument form is deprecated and invalidation becomes *eventual*, not immediate. For read-your-writes use `updateTag()` in a Server Action.

### 3.5a The catalogue is NOT one category

Decided 7 Sep 2026, from Rajat: a friend is joining as a seller, and sellers of
any category may follow - the sample already includes markers, backpacks,
earbuds, whey protein, LED lights, cables and kurtas. Charming Jewels is one
seller on this marketplace, not what the marketplace is.

**What follows from that, in the code:**

1. **No category word in the chrome.** The site title, meta description, header,
   footer and the trust list on the product page must not say "jewellery".
   They did; fixed. Category-specific wording belongs on the product and the
   category page, where it is true.
2. **The category tree stays the only source of categories.** No hard-coded list
   anywhere in the UI - the filter panel already reads
   `/public/products/categories/tree` with live counts, so a new category
   appears by itself.
3. **The theme stays.** Marigold is a warm brand colour, not a jewellery signal;
   the mark is a cut stone because the shop that owns the platform sells them,
   and it is small enough to read as a brand mark rather than a category claim.
4. **Size** - ✅ **done, 9 Sep 2026.** See section 3.5b: a row per size grouped
   by `item_group_id`, which is Google's own model and left the cart, stock
   reservation and orders untouched. The `size` FILTER on /shop is still to
   come; the data now exists for it.
5. **The feed's `gender` and `age_group` backfill was deliberately limited** to
   the 17 platform-owned products. Defaulting another seller's formal shoes to
   `female` would have been invented data.

### 3.5b Sizes and variants — the cheap answer was also the right one

Needed because clothing and footwear sellers are coming (section 3.5a) and
**Google disapproves Clothing (1604) and Shoes (187) without `size`** - a
clothing seller's whole catalogue goes dark for free listings.

**What Google actually specifies.** Each variant is a **separate item in the
feed with its own id**, and `item_group_id` is what groups them. Any apparel
item that varies by colour, material, pattern or size must be submitted as a
unique combination, all carrying the same group id. Size must be the **labelled**
size - "M", not "SM-RED-01".

**So there were two ways to build it, and the market's own model chose for us:**

| | Nested variants inside one product | A row per size, grouped by an id |
|---|---|---|
| Matches Google's feed model | needs flattening on the way out | **exactly** |
| Cart, stock reservation, orders, payouts | all keyed on a product id - **all rewritten** | **untouched** |
| Per-size stock and price | new fields | already there |
| Per-size URL, indexable | needs inventing | already there |

The second is what Shopify does under the hood too. It cost two fields.

**What was built**

- `Product.size` (the label) and `Product.variantGroupId`.
- The feed emits `<g:size>` and `<g:item_group_id>`, each only when set - a
  group of one is not a group, and claiming otherwise tells Google there are
  siblings it will never find.
- The product endpoint returns the sibling sizes with the product, so the page
  renders them in the same pass rather than shifting after a second request.
- The size picker is **links, not a control**: each size has its own URL, so a
  crawler follows every one. Sold-out sizes are shown struck through rather than
  hidden - hiding reads as "they never made it", and the shopper leaves to look
  elsewhere for something we simply do not have today.
- For the seller, **"Add a size"** copies the style - name, description, price,
  photographs - and clears only the size, the stock and the item code. Retyping
  a description per size is how the sizes end up describing different products,
  which is the thing `item_group_id` exists to prevent. Saving the copy also
  writes the group id back onto the ORIGINAL, which otherwise would not know it
  had become part of a group.

Six tests. **Jewellery is unaffected**: Google does not ask for size there, and
an invented "Free Size" would be noise in the feed.

---

### 3.5 What we are deliberately NOT doing

- **`llms.txt`** — Ahrefs studied 137,210 domains: **97% of llms.txt files got zero requests in May 2026**, and *"zero requests came from AI bots for llms.txt files that don't exist. They never go looking."* Google's John Mueller: *"no AI system currently uses llms.txt."* Dead weight.
- **FAQPage markup** — FAQ rich results stopped appearing 7 May 2026 and the documentation was removed. We can still write an FAQ *section* for humans; we will not pretend the markup earns anything.
- **360° spin viewers** — none of the seven Indian jewellery sites in the ₹400–9,000 band use one.
- **Size filters / size charts** — Google requires `size` only for Clothing (1604) and Shoes (187), not jewellery. The Indian pattern is to design the problem away: GIVA writes *"Adjustable size to ensure no fitting issues."*
- **A 39-value colour filter** — that is a 200-SKU pattern. See §4.2.

---

## 4. The pages

### 4.1 `/products/[slug]` — the money page

Order is taken from what all seven of giva.co, salty.co.in, palmonas.com,
melorra.com, bluestone.com, caratlane.com and Myntra do, in the order they do it.

```
breadcrumb
gallery  ·  title
price block: sale + strikethrough MRP + % off + "inclusive of all taxes"
rating + review count
stock line (only when genuinely low)
PINCODE DELIVERY CHECK          ← new; all 7 have it, we have the data
trust strip
quantity + Add to cart + Wishlist
description: design → key details → care → styling tip
reviews, with the distribution and not just the average
related products
```

**Server component** renders everything above except the cart/wishlist/quantity
controls and the pincode box, which are small client islands. Price, stock,
title, brand, description and enough review text to be quotable must be in the
first HTML byte stream.

**Why each new piece is there:**

- **Breadcrumb** — Google made breadcrumb rich results desktop-only in Jan 2025, but it remains a hierarchy signal, and five of the seven competitors keep it.
- **Pincode delivery check** — every one of the seven has it. `getDeliveryOptions()` already computes this; it needs a public endpoint. All the conversion evidence for delivery dates is vendor case studies, so treat the *number* sceptically — but the consistent finding is that **specificity** wins: "arrives Thursday 12 September" beats "ships in 3–5 days".
- **Gallery** — Baymard: **56% of users' first action on a product page is exploring the images**, and **42% try to judge size from them**. Two rules follow, both cheap: at least one image showing the piece **worn on a person** (Baymard: jewellery *"requires the context of a human model"* to convey scale), and one **dimension slide** with measurements drawn on it. Salty already does the second inside its gallery.
- **Mobile thumbnails** — Baymard: **76% of mobile sites omit thumbnails for additional images**, and thumbnails produce the *lowest* rate of unintentional taps of any indicator. All three D2C brands run a fixed bottom add-to-cart bar at 390px. We will too.
- **Return policy, linked from the product content** — Baymard: **60% of users look for the return policy on the product page** and **15% abandon over an unsatisfactory one**; **44% of sites don't link it** from the main product content. This is the cheapest fix in the document.
- **Reviews** — Spiegel Research Center (Northwestern, transaction data): **five reviews raise purchase likelihood 270%** over zero, and the marginal gain flattens after about five. Two consequences: getting the *first five* reviews on a product matters more than anything else about reviews, and **we show the distribution, not just the average** — the same research found purchase likelihood *peaks at 4.0–4.7 stars and falls toward 5.0*, because a perfect score reads as fake. LocalCircles (64,000 responses across 314 Indian districts) found **56% of Indians don't trust written reviews and 59% who posted a negative review said it was never published**. So: verified-purchase badges, dates, published negatives.
- **Material disclosure** — the imitation-jewellery axis in India is *anti-tarnish / skin-safe / nickel-free / plating warranty*, not hallmarking. Palmonas leads with "Anti tarnish · Skin Safe Jewellery"; GIVA writes "Perfect for sensitive skin". Our descriptions already say "imitation jewellery" plainly, which is both honest and legally safer.

### 4.2 `/shop` — the listing

**Filters: Price, Category, Colour, and Rating once reviews exist. That is all.**

Baymard's five essential filters are Price, Rating, Colour, Size and Brand.
Brand is excluded by their own rule on a single-brand site; Size is moot on
adjustable jewellery. **80% of users apply a price filter** regardless of
product type — that one is not optional. Rating is the biggest industry gap:
45% of users treat reviews as a key factor and **only 47% of sites offer the
filter**.

Also fixed here:

- **Sorting moves to the server.** A new `sort` parameter on the products endpoint. The current behaviour is wrong at any catalogue larger than one page.
- **A real "no results" state.** Baymard: *"nearly 50% of sites fail to provide users with effective ways to recover from a search that yields no results."* Salty's is worse than nothing — filter to an impossible price and the grid simply renders empty with no message. Ours will show what was searched, offer to clear each filter individually, and show popular products.
- **Applied filters shown as removable values, not a count.** Baymard: 28% of sites omit this entirely, **66% on mobile**.
- **Numbered pagination with `rel="next"`.** Nobody in the seven uses pure infinite scroll. Load-more is fine for humans but must stay crawlable.

### 4.2a Categories — the research I had not done

Rajat caught this: the listing showed **top-level categories only**, and the
admin form could not create subcategories at all. He was right that it was not
researched. It is now, and the finding is not "put the subcategories back" - it
is that the right answer depends on the size of the catalogue, and the two
halves pull in opposite directions.

**On large catalogues** (Baymard, *Ecommerce Category Pages* and *Consider
Providing Intermediary Category Pages*): an intermediary category page earns its
extra click, and **subcategory tiles must be the FIRST thing on it** - above
banners, above curated products. **76% of sites bury them.**

**On small catalogues** (Baymard, *DTC UX: Avoid Intermediary Category Pages*):
the opposite. Intermediary pages *"impede, rather than enhance"* browsing, and
testers who clicked a subcategory and landed on a page with **no products** were
disoriented and had to click again. Baymard's advice for a shallow taxonomy is
to avoid the layer entirely and take people straight to the listing.

**This shop has about fifty products.** So we take the second finding and keep
what is useful from the first:

1. **No intermediary page.** `/shop?category=jewellery` shows products
   immediately - which is what it already did, and would have been a mistake to
   "fix".
2. **A subcategory row ABOVE the grid**, not instead of it. Selecting Earrings
   is one tap, and the products stay in view.
3. **Siblings, not just children.** When a subcategory is selected the row shows
   the rest of the family, so Rings → Bangles is one tap rather than a trip back
   up the tree. This is the thing Rajat named: *"jewellery mein log alag-alag
   category se dhoondhna pasand karte hain."*
4. **The sidebar expands the branch being viewed** - all categories, with the
   current one's children indented beneath it. Every subcategory of every
   category at once is a wall; none at all leaves the hover menu as the only
   way in, and a phone has no hover.
5. **Empty subcategories are never shown**, anywhere. Baymard's own warning
   about over-categorisation is dead-end categories holding a handful of
   products; with 17 jewellery pieces across 8 subcategories we are close to
   that line already.
6. **Menu headings are links.** Shoppers expect the top level of a flyout to be
   clickable, and ours is.

**What was actually broken, not just missing:** the API *refuses* to create a
main category without at least one subcategory - products live on leaves, so a
main category alone is a heading nothing can go under. The admin form never sent
`subcategories`, so **creating a main category always failed.** It now takes them
one per line.

---

### 4.3 `/` — a real home page

Currently a redirect. It becomes a page: what the shop is, the categories, a
few products, and the Charming Jewels story with the real Jaipur address. The
`Organization` structured data lives here — and since 2026 that is also where
`hasMerchantReturnPolicy` and `hasShippingService` belong.

### 4.4 The six policy pages
Straight ports to server components. They already read their numbers from
`config/policy.js`, which has moved to `web/src/config/policy.js` unchanged.

---

### 4.5 Order tracking — market first, then the old app

Built 9 Sep 2026, following Rajat's order of work rather than my instinct. I had
started to port the React app's `ShipmentTimeline` because it looked good; he
stopped me and asked what the market does first. He was right to.

**What the market says.** Baymard's order-tracking research lists **six details**
a tracking page owes a customer, and finds only **33% of tested sites** provide
all six:

| # | Detail | Did we have it? |
|---|---|---|
| 1 | **Expected delivery date** | ❌ **It was in the database.** Shiprocket sends `etd` on every tracking event and `applyCourierUpdate` stores it as `expectedDeliveryAt` - the page simply never showed it. 25% of sites fail on this one, and it is the detail users cite most |
| 2 | Status progress indicator | ❌ Neither app had one |
| 3 | Carrier name | ✅ |
| 4 | **Linked** tracking number | ✅ |
| 5 | Detailed shipping history | ⚠️ The React app had this and had it RIGHT; my Next port had flattened it to a plain list of the last six scans |
| 6 | What is in the parcel | ✅ |

Baymard also found that sending people to the courier's own site loses control
of the experience - *"I like that this is built right in; I don't have to copy
the tracking number."* So the courier link stays a last resort, not the answer.

**What the old app had that the market's generic advice does not.** The React
component built the history from **real courier scans**, and computed an honest
*next step*: `shipped` has two different next steps, because `shippedAt` is set
when the seller BOOKS a courier and the first scan only means the courier's
system has the manifest - the parcel is on a shelf in both cases. Saying "out
for delivery" there tells somebody their parcel is minutes away while it sits in
a house. A four-dot stepper coloured from `order.status` cannot express that.

**So the new one is both, and better than either:** the courier's own expected
date at the top, a progress indicator derived from THIS parcel's fulfilment (so
a split order does not report the slowest seller), then the real scan history
with the honest next step, and the carrier and linked AWB underneath. Six of
six.

---

### 4.6 Navigation — what the research says, and what we had

Researched 9 Sep 2026 after Rajat asked for the sidebar to be looked at
properly rather than guessed.

**The finding that decides the shape.** Nielsen Norman, Luke Wroblewski and
Baymard all report the same thing, and it is one of the better-replicated
results in this field: **what is hidden behind a hamburger gets used far less
than the same link left in plain sight - often less than half as often.** The
pattern that beats a fully hidden menu is a **hybrid**: three to five things
visible, everything else behind the icon.

Baymard's 2025 mobile benchmark also found **69% of e-commerce sites are
mediocre or worse** on mobile main navigation - so this is a common place to
lose, not an exotic one.

**The patterns available**, per the same research: a hamburger for compact
navigation, a bottom tab bar for 3-5 primary sections, a horizontal scrolling
category strip for flat taxonomies, a full-screen panel for deep hierarchies.
Most sites combine two.

**What we actually had, and the hole in it.** On a wide screen: a category strip
with hover panels - fine. On a phone: the same strip scrolling sideways, and the
subcategory panel was `md:` only. **A phone has no hover.** So on the device
most of this shop's visitors use, "Earrings" was unreachable from the
navigation. The shop page's own filter panel had them; the navigation did not.

**What was built**

- A **drawer** holding the category tree as a two-level accordion. Two levels is
  exactly where an accordion still reads; three or more needs a sliding panel
  with a back arrow, and our category model is capped at two on purpose.
- **The parent is a link, not only a toggle.** Shoppers expect the heading
  itself to be tappable, and a category that merely expands makes them hunt for
  "all of it".
- **Shop, Cart and the account stay visible** in the header. That is the hybrid
  the research recommends, and the reason nothing else moved into the drawer.
- **No bottom tab bar**, though the research recommends one for 3-5 primary
  sections: it would sit exactly where the product page's sticky add-to-cart bar
  already is. Between a bar that navigates and a bar that sells, the one that
  sells wins.
- The tree is fetched **once**, in the header, and handed to both the strip and
  the drawer. Two fetches of the same tree are two chances for them to disagree.

---

### 4.7 The design system - colour, mode, and the logo

Rewritten 9 Sep 2026. Rajat's words: "kuch cool modern gradient type ki cheeze,
youngster businessman and developer theme vibe... shadcn ki asli power dikhao,
consistency ke sath".

**Why marigold went.** It was Jaipur's own colour and it had two faults that
could not be designed around. It is too light to carry white text, so every
filled button used dark ink on it - which pushes a warm, soft, retail-catalogue
feel through the whole interface. And it is WARM, sitting on top of product
photography that is itself warm: jewellery, fabric, skin. The frame competed
with the goods.

**Why violet-indigo.** It is what the software this generation respects actually
uses - Stripe's measured indigo, Linear's brand indigo on cool greys, and the
violet that runs through nearly every AI and developer product. It reads as a
platform rather than a stall. It is COOL, so it recedes behind product
photography. And it is dark enough to carry white text at 4.5:1, which means one
button style everywhere instead of two. `--primary` sits at oklch L 0.50
precisely because that is where white on it clears the threshold.

**The discipline that came with the research.** Premium interfaces use
surprisingly little colour: one colour used sparingly hits harder than five used
everywhere. So the gradient - violet, indigo, cyan, three analogous stops - is a
TOKEN (`--brand-from/via/to`) used only on brand moments: the mark, the sign-in
panel, the home blooms. Everything else is neutral, and violet means "this is
the primary action".

**Dark mode is now real**, not a set of tokens nobody could reach. `next-themes`
on the class attribute, `system` by default because the best theme is the one
the person already chose on their phone, and a single toggle in the header. The
toggle renders BOTH icons and lets the `dark` class hide one - no mounted flag,
no state, no hole where the button should be, no hydration mismatch.

**The logo.** The gem is gone for a reason that has nothing to do with taste: a
gem says JEWELLERY, and the promise of this platform is that it sells anything.
A logo appears on every page, every invoice and every courier label, so it is
the last place to print one category. It is now an isometric parcel - the one
object that means commerce without naming a category - on a gradient tile.
Three faces at three brightnesses, so the depth is geometry rather than a drop
shadow. The tile because that is what a brand mark is now: roughly 40% of the
top hundred apps on both stores sit on a gradient one, and it is the only shape
that survives being a favicon, an app icon and a WhatsApp display picture.
`icon.svg` means the browser tab carries it too.

**Everything is a token.** Re-theming the entire site is editing one block in
`globals.css`, which is exactly what this change was. The only hard-coded
colours left in the app are the two that cannot read CSS: the Razorpay modal's
theme and `global-error.js`, which renders when the stylesheet itself has
failed.

---

### 4.8 Sign-in, sign-up and the password screens

**What was wrong.** The form was a 24rem column dropped into the middle of an
otherwise empty catalogue page, beneath a full category strip. It read as a page
whose content had failed to load.

**What the research says.** A centred card is the safe default; a split screen
is what consumer products use, because it turns a purely functional screen into
the one place you can say what an account is FOR - Flipkart, Myntra and Nykaa
all do it. The rule attached to it is the one that matters: the panel must be
short, scannable, and must not compete with the form.

**What was built.** A shared `AuthShell` behind all four screens, so sign-in,
sign-up, forgotten-password and reset cannot drift apart. Split above `lg`,
card-only below - a phone has no room for a second column. The panel says three
true things about what the account does and nothing else. Also:

- **The category strip is hidden on these four routes.** Amazon, Myntra and
  Meesho all strip catalogue navigation from sign-in, and they are right to: a
  screen with one job should not offer eleven ways to abandon it. The header
  stays, because the logo and the cart are how somebody who landed here by
  accident gets out.
- **The Google button is measured, not hardcoded.** Google's button takes a
  pixel width and will not stretch, so a fixed 320 sat narrower than the "Sign
  in" button below it - two stacked buttons of different widths, which was the
  single thing making the screen look unfinished. It also switches to Google's
  black theme in dark mode.
- **A show/hide toggle on the password.** A password nobody can see is a
  password typed wrong on a phone keyboard, and the failure is silent until the
  form is refused.
- **"New to ShopMaster Pro? Create an account"** separated by a rule rather than
  left as one more line of small print. A first-time visitor who cannot find it
  tries to sign in with an account that does not exist, fails, and leaves.

---

### 4.9 The mark: a jharokha

Rebuilt 9 Sep 2026. The brief: connect it to Jaipur and to India openly, keep it
cool and modern, and **do not let it look fake** - "fraud nhi lage".

**What it is.** A jharokha - the arched window that overhangs the front of almost
every old building in Jaipur, and what Hawa Mahal is five storeys of - lit from
inside, on a deep violet tile.

**Why this and not a monument or a national symbol.** Three reasons, and the
third is the one that decides it:

1. It is genuinely his city's own form. Jharokhas are secular, domestic
   architecture. They are what Jaipur's facades are MADE of, not a landmark
   traced for decoration.
2. It means the right thing. A jharokha is a window others look into - and this
   is a marketplace: a window onto everything other people are selling. A
   doorway is the oldest sign a shop has.
3. It survives being small. An arch and a ledge are two shapes; at 16px that is
   still a window. A skyline or a palace turns to mud.

**Why the opening is pink.** Jaipur was painted terracotta in 1876, on one man's
order, to welcome a visitor - which is why the world calls it the Pink City, and
is arguably the most successful piece of city branding ever done. It is the
correct colour to put inside a Jaipur window, and against deep violet it does the
job the palette needs: a warm light in a cool frame, so the arch reads as LIT
rather than as a hole.

**What it replaced, and why both went.** The gem said JEWELLERY, which is the one
thing the brand must never say. The parcel that replaced it was category-neutral,
which was right, and anonymous, which was not - every logistics company on earth
has a box in its logo.

---

### 4.10 The effects layer

Four techniques, shared, each used in few enough places to still read as
deliberate. The research is consistent on both halves of that: 2026
glassmorphism is translucency PLUS grain PLUS a gradient border PLUS a soft
shadow, and any of them applied everywhere stops being an effect.

- **Glass** - `.glass` / `.glass-strong`. Only on things that float above
  content: the header, dialogs, the drawers, menus, the product page's sticky
  buy bar. Blur is 16px because above ~20 it stops being frosted glass and starts
  being a cost on a cheap phone. The fill doubles as the **barrier layer** that
  keeps text above 4.5:1. There is an `@supports` fallback to opaque, and
  `prefers-reduced-transparency` is honoured.
- **Mesh** - `.mesh`. Native CSS has no mesh gradient; the real technique is
  several radial gradients layered at different positions and sizes. Used on the
  sign-in panel so a large coloured surface has somewhere for the eye to travel.
- **Grain** - `.grain`. One inline SVG turbulence filter, `mix-blend-mode:
  overlay` so it darkens the lights and lightens the darks the way film grain
  does. A perfectly smooth gradient is the thing that gives a screen away as a
  screen.
- **Glow** - `.glow-hover`. A shadow in the brand colour rather than grey. Grey
  says "raised"; brand-coloured says "live". It is a shadow, so nothing moves and
  nothing shifts.

**The bug worth remembering.** `backdrop-filter` written by hand in `globals.css`
was being **silently dropped by the build's CSS transformer** - the site had
translucent bars and no blur at all, in both modes, for as long as the glass
existed. The source said the right thing throughout; it was only visible by
reading the COMPILED stylesheet in the browser. The fix is to ask for the blur
through Tailwind's own pipeline (`@apply backdrop-blur-lg backdrop-saturate-150`),
which the transformer keeps. Check compiled CSS, not source, when an effect
silently does nothing.

---

### 4.11 Search

**The gap.** There was no search box anywhere on the site. The API had supported
`?search=` from the beginning and nothing in the interface could reach it. That
was the largest single gap against every reference.

**What the research says.** Search belongs in the header, VISIBLE rather than
behind an icon, and for anyone hunting a specific thing it beats navigation
outright. Three quarters of shoppers use autocomplete, and the suggestions that
work carry images and category context; on a phone the usable ceiling is five or
six rows, because the list is trapped between the field and the keyboard.

**What was built.**

- `GET /api/public/products/suggest?q=` - a NEW endpoint rather than reusing the
  catalogue one. That one populates the seller, counts the whole result set for
  pagination and returns entire product documents - six times while somebody
  types "earring". This returns the five fields a suggestion row shows.
- Matching is anchored to a **word boundary**, unlike the catalogue's search.
  Plain substring matching answered "ear" with "Pearl Maang Tikka" - technically
  a match, visibly wrong. It still finds "Earrings", "Earbuds" and "Over-Ear",
  because a hyphen is a boundary.
- **Categories come back with the products.** Somebody typing "ear" usually wants
  Earrings, not one pair of them.
- The sale WINDOW fields travel with the price, so a sale scheduled for next week
  cannot show as today's price in the suggestions and the normal price on the
  card two clicks later.
- A real combobox: arrow keys, Enter, Escape, `aria-activedescendant`, debounce,
  and every in-flight request aborted on the next keystroke - without that, a slow
  answer for "ea" lands after the fast one for "earring".
- The suggestion panel is **solid, not glass**. It is dense and it lands on top of
  other text; this is exactly where translucency drops below 4.5:1.
- Results go to `/shop?search=`, which already carries the filters and the sort a
  searcher reaches for next. A separate results page would be the same grid with
  fewer tools.

**The phone trade.** The search field gets its own row, and the category strip is
hidden below `md`. With both, the sticky header ate close to a quarter of a 390px
screen. The drawer carries the whole category tree, the home page opens on a
category grid, and search beats browsing for finding a specific thing anyway.

---

### 4.12 The panel sidebars

**What was there.** Both panels were one row of tabs with **no active state** -
six or seven links that looked identical on every page. "Where am I" is the first
question navigation has to answer and it was the one thing this could not do.
Admin had also grown a seventh link and started wrapping onto two rows.

**Why a sidebar.** Every dashboard worth copying uses one - Shopify's admin,
Stripe's, Linear, Vercel - for three reasons that all apply here: a vertical list
GROWS without reflowing; it can be GROUPED, so "Payouts" and "Orders & disputes"
read as money and arguments while "Categories" and "Coupons" read as
housekeeping; and it answers "where am I" and "where else can I go" at the same
time, which is what a dashboard is asked constantly and a shop front is not.

**Not on the shop itself.** A shopper wants the products to have the width; an
operator wants the map. Same site, two different jobs.

Below `lg` it becomes a drawer - 240px of permanent sidebar on a 390px screen is
a wall, not navigation. Both panels share one `PanelShell`, so they cannot drift
apart, and both keep a "Back to the shop" link because the capability model means
the same account still has a cart while it is in there.

---

### 4.13 Loading states

Built 9 Sep 2026, against the research rather than by taste.

**The window that matters.** A skeleton improves perceived speed only when the
real wait falls roughly between 400ms and 3 seconds. Outside that it does
nothing, and BELOW it a skeleton actively hurts: the page flashes a grey ghost
of itself and then the real thing, and a flash reads as a fault. The pattern the
research describes is nothing at all for the first 300ms, then a skeleton.

So `.skeleton-in` holds every skeleton invisible for 300ms and fades it in. A
page that answers quickly shows a skeleton for zero frames; only a page that is
genuinely waiting ever shows one.

**Why skeletons and not spinners.** A spinner draws attention to the waiting; a
skeleton draws attention to the content about to appear. That shift is the whole
effect - the same wait is rated substantially shorter.

**They mirror the real page exactly.** Same heading position, same 13rem filter
column, same grid, same square image ratio, and on the product page the buy
column in the order it actually appears. A skeleton that does not map to what
follows is grey boxes moving about, and the layout shift when the content lands
undoes the effect it existed to create.

Two routes have one: `/shop`, which waits on three calls (products, filters,
categories) to an API in Singapore that can be cold and is the longest wait on
the site, and `/products/[slug]`. Verified by slowing the shop page to 1.5s and
confirming the skeleton renders, then removing the delay.

---

### 4.14 The royal palette, and where it came from

11 Sep 2026. Rajat: "purple pink (for Jaipur) and blue combination sometimes do
magic - I feel so", and gradienthunt.com as the reference.

**The references, read rather than remembered.** gradienthunt's most-liked page
was rendered in a browser and its 30 top gradients pulled from the DOM - the
purple->magenta radial (#500C8B -> #A10A90), pink->deep navy (#F915D7 ->
#160062), violet->near-black and royal-blue->midnight all sit near the top.
uiGradients' 382-entry catalogue was filtered by hue to the 96 that read as
royal; the ones that matter are "Celestial" (#C33764 -> #1D2671), "Lawrencium"
(#0f0c29 -> #302b63), "Amin" (#8E2DE2 -> #4A00E0) and "Cosmic Fusion".

**What was chosen.** `--brand-from/via/to` are now Jaipur pink -> royal violet
-> royal blue (oklch L 0.50 / 0.40 / 0.34), with a violet stop between the pink
and the blue so they never meet directly - that meeting is where a gradient
turns muddy. `--brand-rose` exists as the one warm accent. The dark ground took
a violet cast (Lawrencium's lesson): a little chroma in the background is what
makes the gradient look like it belongs on it rather than pasted over grey.

**The logo, resolved the same evening.** Gemini image generation has no
free-tier allotment and Google Cloud refused Rajat's HDFC debit card (Indian
debit cards and recurring international billing). Pollinations' gateway offers
`gpt-image-2` on a registered free key - GitHub sign-in, no card - and its
daily Pollen grant covered seven renders before running dry, with no charge
possible because no payment method exists. Six drafts across three concepts;
`jharokha-2` won: a carved sandstone jharokha lit pink from inside on the brand
gradient tile. `scripts/brand/export-mark.mjs` crops the tile out of the
render, cuts the corners at the iOS squircle radius, and writes every size the
site needs (512/192/64 in `public/brand/`, plus `icon.png` and
`apple-icon.png`). The hand-drawn SVG jharokha stays as the flat mark for
invoices and labels. `hawa-mahal-bag-2` - a 3D bag whose top is three jharokhas
- is kept in `public/brand/` as an illustration for the seller page.

---

### 4.15 Show first, say second

11 Sep 2026. Rajat: "har koi itna zyada padhne wala nahi hota - agar interest
aata hai visually pehle, tab wo aage padhta hai."

That is the finding of every home-page study, stated plainly. People do not
arrive to read; they arrive to see whether there is anything here for them, and
decide in a glance. Two screens were built the other way round and have been
turned around:

- **Home.** The hero was a headline, a paragraph and two buttons, with the
  first product below the fold. Now: one line of copy, half the padding, and
  the right half of the first screen is a wall of six live products. Category
  tiles were a name in a box; each now carries the newest photograph in that
  category with the name on a scrim.
- **Sign-in.** The left panel was three short paragraphs about what an account
  does. Now: one line and the same product wall. The three things the
  paragraphs said are still true and still on the policy pages - they were
  never why anybody signed in.

`ProductMosaic` is shared between the two, fetches nothing itself, and every
tile is a link: the first thing a visitor sees is the first thing they can buy.

---

### 4.16 AI for sellers - the strategy, the providers, and where each one goes

Built 11-12 Sep 2026. Rajat's plan in his words: give sellers AI that saves
the work a small seller cannot pay for, from free APIs, "pehle achi quality
wala de denge, agar koi zyada generate karwa raha hai to usse karta-reh wala
doosra". And his question that shaped this section: *"itni saari API le li -
sabse best strategy kya rahegi, kab kya reliable rahega? Product hai
ShopMaster."*

#### The principle: task -> model, never feature -> provider

No feature names a provider. A feature says *"clean this photo, standard
tier"*; `backend/utils/ai/` decides who answers, in what order, and what to do
when one says no. A provider can vanish and one file changes.

#### Reliability ranking, for production

| | Provider | Trust | Role |
|---|---|---|---|
| 1 | **Cloudflare Workers AI** | Highest - enterprise infrastructure, free tier stable for years, no card | **Spine of the standard path**: FLUX.2 klein 4B (~80 edits/day), klein 9B, dev |
| 2 | **Gemini** | High - Google, but free-tier models have been withdrawn mid-use (2.5-flash), so the model is pinned and calls retry | Spine of text and vision: listing drafts, reading the photo |
| 3 | **NVIDIA NIM** | Fair - a developer catalogue, "for testing", one-time credits, 6-month key | Reserve tank for text-to-image |
| 4 | **Pollinations** | Lowest - a small Berlin org, no SLA, Pollen rules can change; but it hosts **the best model** | **Premium bonus, never the only path**: gpt-image-2 (#3 in the world), kontext editing |

**The rule that follows:** the standard path never depends on Pollinations. If
it disappeared tomorrow, every seller would still get klein-4b/9b edits and
Gemini drafts; only the *premium* label would degrade. That is the difference
between a free stack that behaves like a product and one that behaves like a
demo.

#### What the free allowances actually are

Measured, not read off a blog. The first afternoon of testing spent
Cloudflare's whole day on eight images, because "230 free images a day" - the
figure every article repeats - is FLUX.1 schnell's. At Cloudflare's published
per-tile rates, at 1024x1024:

| Model | Neurons / image | Free per day |
|---|---|---|
| flux-2-dev | ~3,750-5,600 | ~2 |
| flux-2-klein-9b | ~1,364 | ~7 |
| **flux-2-klein-4b** | **~125** | **~80** |
| flux-1-schnell | ~58 | ~170 (text-only) |

Pollinations: gpt-image-2 costs ~0.034 Pollen and the daily grant is ~0.25,
so **~7 premium images a day, platform-wide**. Gemini text: free, with the
model pinned.

#### The tiers, as built

| Tier | Edit chain (a seller's photo in) | Generate chain (words only, admin) |
|---|---|---|
| premium | gpt-image-2 -> klein-9b -> klein-4b -> kontext | gpt-image-2 -> flux-2-dev -> nvidia flux.1-dev -> schnell |
| standard | klein-4b -> kontext | klein-4b -> nvidia -> schnell |
| fast | klein-4b -> kontext | schnell |

A quota or upstream failure moves to the next entry. An *input* failure stops:
a bad request is bad everywhere. A seller's first two images of the day take
the premium chain while the platform has premium left; after that, standard.

#### The modes are what a seller actually asks for

`clean` (white studio background), `lifestyle` (shown in use), `angle`
(another view), `custom` (the seller's own scene - "a model wearing these,
side profile, soft light"). All four are EDITS: the photo goes in as a
reference and every prompt opens with the same sentence - the product itself
must not change. A redrawn product is worse than no picture. `generate` (from
words) is admin-only: banners and category art, never a product.

#### Guardrails that make it a product

- **Caps**, per seller per day (60 drafts, 20 images, 2 premium) and platform
  (6 premium), read before the call and charged after a success.
- **Nothing saves itself.** Every result is a preview with Use / Discard. The
  form is the human in the loop.
- **Only our own Cloudinary URLs** are accepted as input - anything else would
  let a request point our fetch, and the providers, at an arbitrary address.
- **Keys live on the server only.** `POLLINATIONS_API_KEY`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `NVIDIA_API_KEY`,
  `GEMINI_API_KEY` - in `backend/.env` locally and in Render's environment in
  production. Never in the repo, never in the browser.
- **Usage is visible.** `GET /api/admin/ai/usage` shows the day's spend by
  provider and by seller.

#### When to start paying

When the admin usage page shows a provider above ~70% three days running. The
first paid line should be **Cloudflare Workers Paid ($5/month = ~450k neurons
= ~3,600 klein-4b edits/month)** - the cheapest scale path by far. Pollen
top-ups only if premium demand actually appears.

#### Verified live, 12 Sep 2026

- Listing from the photo alone: "Oxidised Silver Toned Pearl Maang Tikka",
  colour Silver, category Jewellery -> Maang Tikka, nothing invented.
- klein-9b edit of a 600px phone photo of beaded earrings: same beads, same
  hooks, white background, 1024px, 3 seconds.
- flux-2-dev text-to-image: a listing-quality kundan chandbali on white.
- All quotas were then exhausted by testing; the seller sees "Today's free AI
  image allowance is used up across the whole platform. It refills overnight."

#### Still to build (in priority order)

1. **Embeddings search** - Gemini embeddings (free) or Cloudflare bge, stored
   in MongoDB Atlas Vector Search on the existing cluster. Search that
   understands "shaadi ke liye kaan ka" and a real "similar products" row.
   The largest customer-visible win left.
2. **Voice input for sellers** - Groq Whisper (free, fast) or Cloudflare
   Whisper: describe the product in Hindi, the form fills itself. Typing is
   the blocker for the sellers this platform is for.
3. **Text fallback** - Groq / NVIDIA LLMs behind Gemini, the same chain
   pattern as images.
4. **Real 3D** - image-to-3D (Tripo3D free tier, Hunyuan3D on Hugging Face)
   producing a `.glb`, shown with `<model-viewer>`. A separate feature; single
   photos of shoes, bags and bottles work well, jewellery less so.
5. Admin usage page in the panel (the endpoint exists).

---

### 4.17 AI Studio - one interface over every provider, and who is capped

12 Sep 2026. Rajat: *"jo bhi use kare - admin, seller, customer, Claude Code -
sabko ek interface milna chahiye: kitne AI hain, kya-kya model, select karne
ka option; limit reached ho to dikhe par disabled, kab chalu hoga bhi dikhe,
limit kya hai bhi dikhe."* And: the admin and Charming Jewels (the same
person) are uncapped; other sellers get a limited share; a toggle lets the
admin put the seller caps on himself whenever he wants.

**The catalogue** (`backend/utils/ai/catalog.js`) is the single list: every
provider with its unit, period, published limit and reliability rank; every
model with what it can do, what it costs in that unit, its quality band and,
where ranked, its ELO. Chains, the picker, the status page and the ledger all
read from it.

**The ledger** (`AiProviderState`) is how we know what is left, because only
Pollinations reports a balance over its API. Every success adds the model's
published cost to the provider's period; every 429/402 marks the provider
exhausted for the period. A provider's own refusal always wins over our
arithmetic, and every reset time that is arithmetic is labelled "estimated"
in the interface. Cloudflare was observed to reset on a rolling ~24h, not at
midnight UTC as documented, so its estimate is exhaustedAt + 24h.

**What was corrected the same morning.** Pollinations has NO daily grant on
the free tier - the 0.25 seen the day before was a one-time quest reward.
Quests total ~2 Pollen ≈ 58 gpt-image-2 images, once. Hugging Face's free
$0.10/month buys ~3 Kontext dev edits - the most faithful edits seen, and a
reserve. So the only daily free editing path is Cloudflare klein-4b (~80/day),
and the plan says so plainly instead of the "~7 premium a day" that was never
verified across two days.

**AI Studio** (`/seller/ai`, `/admin/ai`) is a WORKSPACE, not a report -
Rajat's correction after the first version was a table: "Gemini jaisa cool
interface jahan model select ho aur wahin limits likhe hon." So it follows
Gemini's image mode and Shopify Magic's media editor: the photo on the left
(dropped, or picked from your own products), the result on the right
captioned with the model and provider that made it, and ONE bar underneath -
action (white background / in use / describe), Shopify's style chips
(Minimal, Vibrant, Natural, Urban, Refined, plus Festive for this market),
the words, and the model as a chip inside the bar. The chip lists every
editing model with what is left today; a spent one is shown disabled with the
reason and the return time. A "Today" panel carries the allowance (∞ when
exempt) and the toggle. The provider table lives at `/ai/limits`. The photo Edit menu gained a model picker: Automatic, or any editing
model by name with what is left; spent ones shown disabled with why. The
result caption names the model and provider that made it.

**Exemption** is read per request from the database - admin role, or the
platform-owned Seller record - and can be switched off by the account itself
with `aiLimitsLikeSeller`. A chosen model is honoured as chosen: it answers or
refuses honestly, never substitutes.

---

### 4.18 The panels are their own application

12 Sep 2026. Rajat: *"seller ka account bahut confusing hai - aadha customer
jaisa, aadha seller. Seller ki tarah dekhna hai to seller wali cheezein hi
dikhengi na."* He was right, and no reference does what we did: the seller
and admin panels sat INSIDE the storefront - the shop's header, the category
strip, the search box, "Sell on ShopMaster Pro", the footer of policies - and
then a sidebar under all of it.

Shopify's admin, Amazon Seller Central and Meesho's supplier panel are
separate applications: a slim top bar with the mark, the panel's name, a way
to the live shop, and the account; a sidebar; the work. Nothing that helps a
shopper, because a person running a shop is not shopping.

`ShopChrome` shows the storefront's header and footer only on storefront
routes (a client gate on the path; the chrome stays server-rendered).
`PanelShell` brings its own bar: logo, a "Seller"/"Admin" badge, **View shop**
(a destination, not a return), the account without a cart link, the theme
toggle. The sidebar is unchanged.

**And the road from an AI picture to a product**, which did not exist:
every image the Studio makes is recorded (`AiDraft`), the Studio's result has
**Add to a product** (pick one of your own, main or gallery, saved at once by
`POST /ai/attach` with the five-photo cap still enforced), the product form's
photos section has **Add from your AI pictures**, and the Studio's strip shows
recent pictures after a reload rather than only this tab's memory.

### 4.19 The seller's daily pages, to the product form's standard

12 Sep 2026. Rajat brought three design resources - a clone of
`awesome-design-md` (74 DESIGN.md files from Stitch: Linear, Stripe, Shopify,
Airbnb...), the `ui-ux-pro-max` plugin (119 searchable UX rules) and the
`taste-skill` plugin (a redesign audit). What each was good for:

- **awesome-design-md** - the *format*, not any one file. ShopMaster now has
  its own `web/DESIGN.md` in that shape: frontmatter with the live tokens
  (oklch palette, Geist scale, radii, glass, elevation), then the reasons -
  why not marigold, why one typeface, where glass is allowed and where it is
  not, the do's and don'ts. It is the file to hand any tool or person before
  they touch a page. The clone itself is gitignored.
- **ui-ux-pro-max** - the audit. Its rules against the seller Dashboard,
  Orders and Settings found exactly what the product form had already fixed
  elsewhere: placeholder-only labels (Forms, priority 8), "Loading…" text
  where a layout-shaped skeleton belongs (Feedback), no empty states, no
  deep link to a filtered view (Navigation), a status told by a word alone
  with no colour agreeing with it.
- **taste-skill / redesign-skill** - a second opinion on the same three
  pages; useful for its checklist of missing states (hover, empty, error,
  loading). Its taste advice ("avoid purple gradients", "avoid Lucide") is
  generic and was ignored where DESIGN.md had already decided otherwise.

What was built, each from a reference:

- **Dashboard** (Shopify Home, Seller Central home): a *setup guide* for a
  shop that cannot ship yet - pickup address, first product - that removes
  itself when both are done (Charming Jewels itself had no pickup address; the
  guide found it). Three metrics with icons, then **Waiting on you**: the
  orders themselves, not a count, each row a link. Low stock with a dot that
  agrees with the words. A skeleton that mirrors the layout, a retry on error.
- **Orders** (Shopify Orders, Amazon Manage Orders): stage tabs with counts -
  To pack / Shipped / Returns / All - kept in the URL (`?tab=`) so the
  dashboard links straight to the pile; a search box for the order number a
  customer reads out; a status badge in words and colour; every line with its
  **product picture** (`getMyOrders` now populates `items.productId images`);
  action errors as toasts in the server's own words.
- **Settings** (Shopify settings, Baymard): label above every field, hint
  below, `autocomplete` on the address so a phone fills it; a real switch for
  shop-wide free delivery; a save bar that is disabled until something changed
  and offers Discard; only the changed part is sent, so a new seller can flip
  the delivery switch before typing an address.

Shared: `PageHeader` (title, one line, optional action) and `PanelCard` (the
product form's card) so every panel page is one material; `ui/switch.jsx` on
Base UI.

### 4.20 The customer's order page: actions next to the thing they act on

12 Sep 2026, the first page done through `/redesign`. Rajat's decision:
*"A karlo agar docs + research se yahi pata laga hai."*

The feature diff (WHAT-IS-LEFT §1) had shown three things the Next port
dropped from this page: a customer could not cancel one item, could not raise
a dispute at all, and was never told why an order had been cancelled. The
references then decided the shape rather than just the gap:

- **Amazon.in** cancels per item, offers "Problem with order" on the shipment
  that has the problem, and its A-to-z claim has two gates — something must
  have shipped, one claim at a time — and a short list of categories.
- **Flipkart** gives every item its own row with its own Cancel, and a
  cancelled line carries "Cancelled — reason" in a grey band.
- **Baymard** (order status): problem-actions belong next to the status they
  concern, not in a box at the bottom.

So the single "What you can do" box is gone. Cancel sits on the item row (only
where `cancellableItemIds` says so), **Something's wrong** sits on a shipped or
delivered parcel (only where `canDispute` says so; categories are Amazon's,
with optional detail for the admin), a cancelled order says who and why with
the refund promise read from `config/policy.js`, and the return — which the
API applies to the whole order once every parcel has arrived — is the one
action still below on its own. The two new flags are decided on the server
(`cancellableItemIds`, `customerMayDispute`) and the dispute endpoint uses the
same helper as the page, so the button and the refusal cannot disagree. 910
tests.

### 4.21 Writing a review, and the badge that needed no flag

12 Sep 2026, through `/frontend` + `/backend`. Gate: trust (every marketplace
guide names reviews with verified-purchase flags as how a new marketplace buys
trust) and the cutover (the React app could write reviews; `web/` only read
them).

**References.** Flipkart: "Rate this product" — five stars each carrying a
word (Very bad … Excellent), then title and description, shown to verified
buyers only. Amazon: the same order, rating first, the rating alone enough to
submit. Baymard on reviews: show the spread, label verification, let people
edit what they wrote.

**What was found.** The badge Rajat was asked to decide on (OPS Q3) never
needed a flag: the API already refuses a review from anyone without a
delivered order containing the product, and stores the `orderId`. Every review
*is* a verified purchase by construction, so the page says it once above the
list and labels each one — honest on all of them, invented on none.

**Built.** `GET /reviews/product/:id/mine` → `{ canReview, reason, review }`,
using `deliveredOrderWith()` — the **same** lookup the POST refuses with
(`utils/reviewEligibility.js`), so the form is drawn only where the endpoint
would accept it. `ReviewForm` is a client island on the server-rendered
product page: signed out → one line with a sign-in link; signed in and not
eligible → nothing (the sentence above already explains); eligible → stars
with words, optional title and body, "Post review"; already written → their
review with Edit and Remove (confirmed). `router.refresh()` after a save, and
the reviews fetch is uncached so the list and the rating bars update at once.
915 tests.

### 4.22 The product video, back

12 Sep 2026. Gate: the cutover — the React app could upload one clip per
product and play it; `web/` had neither, and `Product.video` was waiting in
the model with the upload path (`cloudinary.uploadVideo`, poster from the
first frame, delete-on-replace) already built and tested.

**References.** Amazon and Flipkart both put the clip **in the thumbnail
strip** with a play badge — never a separate section — and neither autoplays
it. Amazon's seller form has a separate "Upload video" slot beside the image
slots with the limits written where you press.

**Built.** `Gallery` takes `video`; it becomes the **second** tile (visible
without scrolling the strip, while the first photograph stays the LCP element
and what Google indexes), `preload="none"`, native controls, poster until
play. `VideoSlot` under the photos in the product form: add / replace / remove
with Undo, 7 MB cap stated up front (the JSON body limit less base64's third),
local preview of a newly chosen file; the form says exactly one of keep /
replace / remove on save (`undefined` / data URL / `null` — the server's
existing contract). The stored `video` object is no longer spread back into
the PATCH body.

With this, `WHAT-IS-LEFT.md` §1 — what the React app could do that `web/`
could not — is **empty**, pending Rajat's own browser check of the review form
(as a customer with a delivered order) and one video upload.

### 4.23 "Sold by Charming Jewels", not "Sold by Rajat Mittal"

12 Sep 2026, found while verifying the video with the test accounts. The
public product routes populated `sellerId` with the **User's** name, so every
product page said *Sold by Rajat Mittal*, the seller's own page said
*Charming Jewels*, and the Google feed sent `<g:brand>Rajat Mittal</g:brand>`
on all 17 items. Etsy and Amazon name the shop, never the owner — and naming
the owner on every product tells the world which shop the platform's
operator runs, which §7c says never to reveal.

`utils/shopNames.js`: one query per page resolves seller user ids to
business names; `withShop()` stamps `shop: { id, name }` on each product
without touching the document the old app still reads. Used by the product
list, the single product and the feed; the page and the JSON-LD brand read
`product.shop`. Feed now: 17 × `Charming Jewels`. 919 tests.

Verified in the local browser with the test accounts (12 Sep): customer
Abha — review form shows her existing review, Edit → 4 stars → Save updates
the list and the bars at once (restored to 5); seller Charming Jewels — a
3-second generated clip uploaded through the new slot, Cloudinary returned
URL + poster + duration, the gallery showed the play tile second and played
it with the poster; the clip was then removed through the same contract
(`video: null`) so the public test product carries nothing silly.

### 4.24 Evidence where the verdict is; failed attempts where they can be acted on

12 Sep 2026. Gate: trust — an admin was deciding "delivered but nothing came"
without the courier's proof, and a seller never learned a delivery had
failed. All of it was already in the database (`podUrl`, `ndrReason/At/
Attempts`, `nprReason`, `disputeReason`, `deliveryConfirmedBy`); nothing
displayed it. Amazon's A-to-z shows the claim, the carrier's proof and the
attempts on one screen; Seller Central flags failed attempts on the order;
the customer's page says "delivery attempted".

Built, small: an evidence block per parcel on the admin order card (customer
says · delivered when/by whom/courier · POD link or "none" · failed attempts ·
not collected); the seller queue gets an amber "Delivery attempt failed
(n times): reason — call the customer after two" and a red "not collected —
book again"; the customer's parcel says the courier tried and will try again.
The seller payload now carries the four fields. No new endpoints, no new
tests needed beyond the existing 919.

### 4.25 The rest of the seller panel, to the same standard

12 Sep 2026. Gate: seller recruitment - the panel is what the next Jaipur shop
lives in every day.

- **Products** (Shopify Products + Seller Central's inline quantity): tabs
  All / Live / Out of stock / Hidden with counts, in the URL; search by name,
  SKU or size; status badge that agrees with the numbers (Low shows what is
  left); the row opens the editor, "View in shop" beside it; stock still
  edited in the row, Enter saves, a toast says the new count went to the
  stock history; empty state with the one CTA; skeleton; retry.
- **Earnings**: the bank-account form had placeholder-only labels - on the
  one form where a typo sends money to a stranger. Labels above, hints below,
  IFSC/account cleaned as typed, and the account number typed twice as every
  Indian bank's beneficiary form does; Save disabled until they match.
- **Order detail, Stock history**: layout-shaped skeletons instead of
  "Loading…". Nothing else there failed the checklist.
- **Admin** (same day, same audit): skeletons on all six pages; the coupon
  and category forms and the payout UTR field get labels above and hints
  below; every page opens with a title and one line. The admin is one person,
  so nothing beyond what failed the checklist was touched.

### 4.26 The Seller Agreement: rules first, consent first, enforced

12 Sep 2026. Rajat: *"jaise Amazon/Flipkart/Myntra/Meesho sakht niyam se
chalta hai waisa hi… seller banne se pehle hi rules padha dene chahiye,
consent maang lena chahiye."* Gate: seller recruitment and trust — the plan's
own §2a said "write the seller rules before the first outside seller"; this is
that, with teeth.

**References.** Amazon's Business Solutions Agreement (consent at signup;
pre-fulfilment cancel rate reviewed above 2.5 %; since Aug 2026 a
seller-caused cancellation costs 10 % + GST under ₹10,000), Flipkart's Seller
Terms (Aug 2026: ₹30 late dispatch, ₹60 seller cancel, ₹90 both), Meesho's
Supplier Agreement (₹25 cancel, ₹50 late dispatch), and their common shape:
one document, numbered, the money as numbers.

**One source of numbers.** `backend/config/sellerRules.js` (version 1.0,
effective 12 Sep 2026): 2 free seller-caused cancellations per 30 days, ₹50
each after; dispatch in 2 business days; 7-day returns; payout 7 days after
delivery; 72 h to answer a dispute; 8 % default commission; account reviewed
above 5 % cancel rate. Served at `GET /api/public/seller-rules`; the agreement
page, the consent checkbox, the dashboard and the payout code all read it.
**No GST anywhere** — neither the platform nor its shop is registered, and the
page says so.

**Consent.** `Seller.agreement { version, acceptedAt }`. Both roads to
becoming a seller (register as one, apply from an existing account) send
`acceptedSellerAgreement` + the version shown; the server refuses without it
(`agreementRefusal`), and refuses a stale version. Existing sellers see a
banner on every panel page until they accept the current version; the admin's
seller list shows who has and who has not.

**Enforcement.** `utils/sellerCharges.js`: on a seller-caused cancellation
beyond the allowance a `SellerCharge` row is written (own collection — it
grows for as long as the shop trades) and the parcel is stamped, so the order
card says "₹50 cancellation charge… comes off your next payout" where it
happened. `createPayoutForSeller` nets unclaimed charges off `netPayable`
(`deductions` on the payout; never below zero — the remainder is written off,
not chased) and claims them exactly once. Customer- and platform-caused
cancellations never reach it.

**The metric.** `cancelStatsFor(sellerId)` — one helper for the seller's
dashboard line and the admin's list, so both quote the same figure against
the same review line. 930 tests.

### 4.27 The seller panel, Shopify-shaped: five names, AI inside the work

12 Sep 2026. Rajat, looking at his own panel: *"bahut confusing UI hai seller
ke liye… AI Studio koi alag cheez lagta hai, idhar product management laga
hai… bade log aise nahi karte honge."* He was right. Gate: seller recruitment.

**References.** Shopify admin: Home · Orders · Products · Customers ·
Finances · Settings, and Shopify Magic is a button inside the product editor,
never a page. Seller Central: Catalog · Inventory · Orders · Payments ·
Performance; "Generate listing content" lives inside Add a Product. Meesho:
Orders · Catalog · Payments · Returns. All three call the money page
**Payments**; none has an "AI" item or a "Records" group.

**Built (Option A, his pick).** Sidebar is five nouns, no group labels:
**Home · Orders · Products · Payments · Settings**. *Products* has its own
tabs — **All products · Photo studio · Stock history** — so the AI studio is
where products are, not a place to go. Old addresses (`/seller/ai`,
`/seller/inventory`, `/seller/earnings`) redirect. **The model is visible
wherever AI works**: the Studio bar, the photo edits in the form, and now
**Write it for me** has a writer chip (Automatic → Gemini with nano behind it
· Gemini · gpt-5.4-nano) with the day's remaining drafts, and the result says
who wrote it. Home's **setup guide is the whole road**, numbered: Agreement →
pickup address → bank account → first product → share the shop link, each
step opening its page and ticking itself; under it one line, "how selling
works here", linked to the agreement.

### 4.28 AI beside every field, in any language

12 Sep 2026. Rajat: a seller who wrote the title in Hindi, or wrote English
badly, must be able to fix one field without regenerating the whole listing;
and whatever little they give - a photo, a name, a line in Hinglish - the
whole form should fill from it. Gate: seller recruitment (Meesho's sellers
write Hinglish; a form that only speaks English loses them at the first box).

**References.** Shopify Magic: a sparkle beside the title and beside the
description - improve, tone, translate - separate from "generate". Amazon's
listing assistant: per-attribute generate. Both keep the previous text
reachable.

**Built.** `POST /ai/refine { field, action, text }` → `utils/ai/refine.js`
(polish · translate · shorten · detail), same honesty checks as the draft
(no invented facts, purity claims flagged, only the allowed HTML), same daily
allowance, same Gemini→nano road and the writer chip's choice. `FieldAssist`
- the sparkle - sits beside Title and Description; every rewrite lands with
an Undo toast. "Write it for me" becomes **Write it again** after a draft,
works from keywords alone, and the prompt now reads the seller's words in
any language and always writes English. Live: a Hinglish description came
back as two clean English paragraphs. 940 tests.

### 4.29 The first day: a wizard, then one next thing

12 Sep 2026. Rajat: *"jaise hi ghuse sab samajh aa jaaye - kahan jaana hai,
kya karna hai, next kya hai. Main workflow taiyaar ho."* Gate: seller
recruitment - the first ten minutes decide whether the next Jaipur shop stays.

**References.** Meesho's supplier onboarding: a wizard - one screen, one job,
a step counter, no panel until done. Shopify's first-run Home: setup guide,
one step open at a time, progress bar; afterwards a Home that leads with the
single most urgent action. Seller Central's "Your seller journey" likewise.

**Built.** `Onboarding` wraps the seller panel: a shop with nothing listed
sees a 4-step wizard and nothing else - **1 The rules** (five lines + accept)
→ **2 Where the courier collects** (form on the same screen) → **3 Where the
money goes** (bank form, number typed twice) → **4 Your first product** (three
lines, one button) → *"Your shop is live"* with Copy-the-link. No skip; the
product form is the one page allowed through. A shop that has already listed
is never gated - Home's guide nags instead. Home is the dashboard first - **Next:** one line, one button, chosen in this order: an order to pack → pickup address →
bank account → an out-of-stock product → fewer than five products → share the
link; then the tiles; then, for a trading shop, setup as a **strip** - "3 of 5
left", a progress bar, the remaining steps as buttons - not a wall (Rajat,
later the same evening: "bidte hi setup form dikhana ajeeb hai"). The wizard's
steps other than the agreement carry "Do this later"; the strip keeps asking.
The product form's cards are numbered **1 Photos · 2 Words · 3 Category
· 4 Price and stock · 5 Details**, leads cut to one line, and the model
selector folded under "More" - the people who change it know to look.

### 4.30 Listing quality: the score, the fixes, the search words, and Google's own verdict

12 Sep 2026. Rajat: *"lalach deke madad bhi karni padegi - keywords, SEO,
Google pe upar aaye."* Gate: liquidity - Search Console said it plainly:
90 days, seven queries, all the brand name, no product word, 8 of 10 pages
not indexed.

**References.** Amazon's Listing Quality dashboard (a score with the next fix
on top), Etsy's listing score, Shopify's SEO preview; Search Console and
Merchant Center as the only data that is about *our* pages.

**Built.** One card at the top of the product form, `ListingQuality`:
1. **Score /100**, live from the form (`lib/listingScore.js`, mirrored in
   `backend/utils/listingScore.js` - fourteen checks, each a thing Google or a
   shopper reads: title words/colour/length, 1 and 3 photos, 90-word
   description with structure, category, colour, audience, size where the
   category needs it, brand or code, weight, three search words). The three
   biggest fixes on top, each a jump to its field, points shown.
2. **What people type** - `POST /ai/keywords`: 8-12 phrases an Indian shopper
   would type (type, colour, occasion, Hinglish spellings), green where the
   listing already carries them, the rest one tap into the new **Search
   words** field (tags), "Add all missing", and a title tip.
3. **How it looks in Google** - a result preview from title, category, price
   and the first line.
4. **Google, right now** (saved products) - `GET /seller/products/:id/google`:
   URL Inspection (indexed? state? last crawl), Merchant Center product
   status with Google's own issue text and help link, and the queries that
   showed this page. Own products only. Live for Pearl Maang Tikka: "not yet
   · URL is unknown to Google", Shopping approved, no queries - the honest
   starting line.

---

## 5. Structured data

GIVA's markup is the reference implementation for an Indian jewellery store and
we will match its shape: `Organization` + `Product` + `BreadcrumbList`, with
`ItemList` on the listing.

**Product / merchant listing** — required: `name`, `image`, `offers`.
Recommended and worth having: `brand.name`, `sku`, `mpn`, `description`,
`color`, `material`, `aggregateRating`, `review`, `category`.

**Offer** — required: `price`, `priceCurrency`. Recommended: `availability`,
`itemCondition`, `url`, `shippingDetails`, `hasMerchantReturnPolicy`.

**No GTIN, and that is fine.** Merchant Center: *"If you're the only seller of a
product or if your product is a store brand, it generally won't have a GTIN."*
We already send `identifier_exists: no`. Accept that seller-cluster experiences
are out of reach; product snippets, popular products and Images are not.

**The rule that governs all of it:** never let a fact exist *only* in schema.
searchVIU built a page with eight prices in eight locations and asked five AI
systems to find them — the price that existed only in JSON-LD **was found by
none of them**, Claude found zero of eight overall. And Ahrefs' difference-in-
differences study of 1,885 pages that added schema found **no citation uplift on
any platform** (AI Overviews actually −4.6%). Schema earns rich results and
feeds Merchant Center. It does not talk to AI. **Visible text does.**

---

## 6. Next.js 16 traps to avoid

Each of these is documented and each would cost a weekend to find:

- **Do the "does this product exist" check before any `await`** in `/products/[slug]`. Once streaming starts the response is committed to 200; a `notFound()` after that cannot become a 404 — Next injects `<meta name="robots" content="noindex">` instead and the docs warn *"some crawlers may label these responses as 'soft 404s'."*
- **Never put the LCP element inside a `<Suspense>`** — it cannot paint until the boundary resolves. Next's docs say so outright.
- **`next/image` needs `sizes`.** Without it the browser assumes `100vw` and downloads an oversized image, which is an LCP problem on exactly the mobile connections we care about.
- **`middleware.ts` is now `proxy.ts`** — rename the file *and* the export. Node runtime only.
- **`revalidateTag` takes two arguments now.** See §3.4.
- **Do not pin below 16.3.4.** 16.3.3 shipped two unauthenticated RCE fixes, one in the Image Optimization API.
- **Turbopack CSS ordering, issue #83941** — cascade order can differ between `next dev` and `next build`, open since Sept 2025, non-deterministic. This directly threatens Tailwind + shadcn. **Check the production build visually, not just dev.**
- **`next lint` is gone**; `next build` no longer lints. CI must run ESLint itself.
- Async request APIs are fully removed with no compatibility period, and the `upgrade` codemod does *not* migrate them.

---

### 6a. Asking "why" — the dialog behind every consequential action

Built 9 Sep 2026, in Rajat's order: read the old app, **set it aside**, study
the market, then map the old thing onto the market's answer.

**What I had shipped, and it was mine, not inherited:** `window.prompt()` and
`window.confirm()` in **nine places** - cancelling an order, refusing a return,
suspending a shop, recording a failed transfer, booking a courier, removing an
address. Browser dialogs cannot be styled or laid out, some browsers block them
outright, and on a phone a prompt is a system sheet with a tiny single-line
field - for text a seller is expected to write carefully, because a customer
will read it back.

**What the market does**

- **Named reasons first, free text second.** Flipkart's cancellation flow gives
  a list and a *"my reason is not listed"* box. A list is faster, reads back
  sensibly six months later, and can be counted. Free text alone produces "ok"
  and "not needed".
- **The button says what it does.** Nielsen Norman: label a confirmation with a
  verb and a noun - *"Cancel this order"*, never "OK" or "Yes". Vague labels
  make people map buttons to actions in their head, and that is where misclicks
  come from.
- **No "Are you sure?"** - it asks nothing the dialog has not already said.
- **Red only where something is destroyed.** Red on everything teaches people to
  ignore red.
- For genuinely dangerous operations NN/g suggests requiring a non-standard
  action (typing a name, say). **Not used here** - nothing in this panel is
  irreversible enough to earn that friction, and friction spent where it is not
  needed is friction ignored where it is.

**What survived from the old React app.** Its `ReasonModal` had two things worth
keeping and both are in the new one: a **minimum length**, because a one-word
reason makes a dispute impossible to settle afterwards; and a line telling
whoever is typing that **the other side will read it**, which changes what
people write.

**The result:** one `ActionDialog`, used by all nine. Reasons are written for
each action from what actually goes wrong here - "It never came back", "It came
back used or damaged", "A different item was sent back" for a refused return;
"Not dispatching orders", "Repeated cancellations" for a suspension.

Booking a courier is the interesting one: not destructive, but **irreversible in
the way that matters** - it spends real money from the Shiprocket wallet. So it
is confirmed, and deliberately not painted red.

**Not yet seen rendered in a browser.** It builds and lints, and it is a stock
shadcn Dialog, but every screen using it is behind a login I have not opened.

---

## 7. Order of work

Each step ships independently. `frontend/` stays live throughout.

| | Step | Why here |
|---|---|---|
| 1 | **Feed: add `color`, `gender`, `age_group`** | Not frontend, but it is live risk to 17 products in review. Do it first |
| 2 | Layout, header, footer, the six policy pages | Smallest surface, proves the shell |
| 3 | `sort` on the products API + a public delivery-estimate endpoint | Both pages need them; both are backend |
| 4 | `/products/[slug]` | The money page |
| 5 | `/shop` | How people reach it |
| 6 | `/` | New page, no existing behaviour to preserve |
| 7 | Port the 30 private routes | Mechanical: `'use client'`, `useNavigate`→`useRouter`, `<Link to>`→`<Link href>` |
| 8 | Cutover: point the domain at `web/`, delete `frontend/` | One copy of everything again |

**Not in this plan, deliberately:** payment, checkout logic, seller and admin
behaviour. Those pages get ported, not redesigned. The money paths are correct
and heavily tested; changing them while changing the framework would make any
failure impossible to attribute.

---

## 7a. This is two projects, not one — keep them apart

Half of what follows is **backend architecture**, not front end:

    User.role becomes a capability, not an identity
    the JWT changes shape
    roleMiddleware changes
    Google sign-in is a new auth path
    the products endpoint gains a sort parameter
    a public delivery-estimate endpoint appears

The other half is the interface. **They ship in separate commits.** If auth and
design change together and something breaks, there is no way to tell which one
did it - and auth is the part where a mistake logs the wrong person into the
wrong account.

---

## 7b. Third-party services — what we actually need

| Service | Verdict | Why |
|---|---|---|
| **Sentry** | **Yes** | There is no error tracking of any kind today. A 500 at checkout is invisible: Render's logs are ephemeral and nobody reads them. Free tier is 5,000 errors a month, which is more than this shop will produce. Smallest effort, largest blind spot removed |
| **Firebase (FCM)** | **Later, only for web push** | "Your order has shipped" as a browser notification. Free, but needs a service worker and a permission prompt, and it is worth nothing until there are orders to notify about. Not now |
| **Google Drive API** | **No** | Nothing to put in it. Product images are on Cloudinary, invoices are generated from the order, backups belong to Atlas. It would be a dependency in exchange for nothing |
| **Gemini** | **Already in** | Writes product descriptions. Free tier ran out at 16 products in one day, so the remaining 35 finish on a later day. Worth paying for only when drafting is a daily job rather than a one-off |

---

## 7c. The brand colour contradiction

`frontend/src/index.css` carries a comment saying:

> *"Marigold is kept deliberately - it is already the brand, and it is Jaipur's
> own colour, which is where this shop actually is."*

The values beneath it are **Tailwind blue** (`#2563eb`). At some point the ramp
was replaced and the comment was left behind, so the file argues for one colour
and ships another.

**Decision: go back to marigold.** Blue is the default every dashboard ships
with; it says "software". A warm gold says jewellery, and it sits with the
product photography instead of fighting it. The accessibility work in that
comment stands either way - the readable step is `-700`, not `-500`.

**The mark:** a cut stone - a table over a pavilion, two facet lines. Drawn as
SVG in `currentColor` so the header, a black invoice, a dark footer and the
favicon are one file rather than four that drift. `web/src/components/brand/Logo.jsx`.

---

## 8. Signing in

### 8.0 BUILT, 9 September 2026

Project `shopmaster-pro-508019`, client `ShopMaster Pro web`, origins
`https://www.shopmasterpro.in`, `https://shopmasterpro.in`,
`http://localhost:3000`. **No redirect URI** - the ID-token flow has no redirect
- and **the client secret is not stored anywhere**: verifying an ID token needs
only the client id, as its audience.

**No Google API had to be enabled.** The consent screen and an OAuth client are
the whole of it; the API Library is for other products.

What was built: `POST /auth/google` verifies the token with
`google-auth-library` and issues OUR session, the same one the password path
issues. Three cases - known Google account signs in, verified email links to an
existing account, nobody creates a customer. `User.googleId` is `sub`, never
email, and `password` became conditionally required so a Google account is not
forced to invent one.

11 tests. Two of them are the ones that matter:

- **A token issued for a DIFFERENT app is still a real Google token.** Without
  the audience check anybody who can get a token for their own app signs in here
  as that user.
- **`email_verified` must be true**, because accounts are LINKED by email:
  accepting an unverified address would let somebody claim one they do not own
  and walk into the account that has it.

And one found by running the real library: its own errors quote the token back -
*"Wrong number of segments in token: eyJ..."* - and that message was on its way
to the browser as a 401. It is logged now, and the person gets a sentence.

**Still to do:** the consent screen is in *Testing*, so only listed test users
can sign in and consent expires every 7 days. **Audience → Publish app → In
production.**

### 8.1 Google, on our own session — not NextAuth

**How it works.** Google Identity Services renders the button and One Tap; the
browser shows the accounts already signed in on that device. On success GIS
hands us an **ID token (a JWT)**. That token goes to `POST /api/auth/google` on
Express, which verifies it with `google-auth-library` (`verifyIdToken`, audience
= our client ID) and then issues **our own** session cookie, exactly like the
password path does today.

**FedCM is the transport, not a replacement.** Chrome now runs One Tap over
FedCM because third-party cookies are gone. The API we call is unchanged; what
changes is that the account chooser is drawn by the browser. Nothing to migrate.

**Key on `sub`, never on email.** `sub` is Google's permanent user id. Email can
change, and a Workspace admin can reassign an address to a different person —
matching on email is how one person ends up inside another's account. Store
`googleId = sub`; use email only to *link* to an existing account, and only when
`email_verified` is true.

**No NextAuth / Auth.js.** It would create a second source of truth for sessions
alongside the Express JWT we already issue, and every authorisation check in the
backend reads that JWT. Auth.js is also in maintenance mode — Better Auth took
over in Sept 2025 (Vercel acquired it July 2026). Adding a dependency in
maintenance to duplicate something that works is two mistakes.

**Email/OTP stays.** A link opened inside the Instagram or Facebook in-app
browser gets `403 disallowed_useragent` from Google — those webviews are blocked
outright. Instagram is where this shop's traffic will come from, so Google
sign-in can never be the only door.

**One manual step, and it is a hard gate:** the OAuth consent screen must be
published to **In production**. While it is in *Testing*, sign-in is capped at
100 users and consent expires every 7 days — customers would be silently logged
out each week.

### 8.2 What the screens are

| Screen | What it holds |
|---|---|
| Sign in | Google button first, then email + password. Not a modal — a real route, so it can be linked to and returned from |
| Create account | Same two paths. Nothing about selling appears here |
| Forgot password | Already exists; carried over |

There is no "sign up as a seller" choice anywhere on these screens. See section 9.

---

## 9. One account, two roles

### 9.0 BUILT, 8 September 2026 — and what the research actually said

Rajat asked whether the big shops do it this way before agreeing. The honest
answer is **split**, and two of the names he listed are not marketplaces at all:

| Platform | One account for buying and selling? |
|---|---|
| **Amazon** | **Yes.** Their own registration guide says you can create the selling account with the same email and password as your customer account, and Seller Central forums confirm the buyer account then stays linked to the seller account permanently |
| **Etsy** | **Yes**, explicitly: *"You'll use this account to run your shop and to buy from other makers on Etsy"* |
| **eBay** | **Yes** - personal to business is a one-way upgrade of the same account |
| **Flipkart** | **No.** Identity is keyed on mobile + email; a separate seller account needs a different mobile number |
| **Meesho** | **No.** The supplier panel is its own registration at supplier.meesho.com |
| **GIVA, Tanishq, V-Mart** | **Not applicable** - single-brand shops. They have no sellers, so they cannot be evidence either way |

So it was not settled by copying. What settled it were our own facts: Charming
Jewels **sells here and buys here**, and its account was answered 403 by every
customer route. And a shopper who wanted to sell had to register again with a
second email, ending up with two order histories and two passwords for one
person. Amazon and Etsy show the model works at scale; Flipkart and Meesho show
that a second account is still possible for anyone who wants one - a different
email is still a different account here too.

**What was built**

- `backend/utils/capabilities.js` - buying is not a role (anybody signed in can
  buy); selling is a capability granted by the **Seller record**, which is the
  thing an admin already approves; admin stays a role.
- `roleMiddleware` asks what an account CAN DO instead of comparing `role` to a
  list. Same call sites, same downstream gates: `checkSellerStatus` still blocks
  suspensions and `requireApprovedSeller` still blocks unapproved listing.
- `POST /auth/become-seller` - selling added to an account that already exists.
  It creates the application; it does not approve anybody, and it does not touch
  `role`.
- `GET /auth/me` returns the capabilities, and the header, both guards and the
  /sell page draw from them.
- **An admin is deliberately NOT a shopper.** The platform's own account buying
  through the platform muddles every report that counts orders.

**A data leak this change would have caused, caught before it shipped:**
`inventoryController` scoped stock history with `req.user.role === "seller"`.
Once selling stopped being a role, a seller whose `role` still said "customer" -
now the normal case - would have fallen through to the ADMIN branch and been
handed **every other seller's stock movements**. The test is inverted now:
anybody who is not an admin sees only their own.

**Proved against a running server, not asserted:** a seller adds to a cart
(200, was 403); a customer is refused a seller route (403); applying returns
201, applying twice returns 409, and afterwards the account has `seller=true,
approved=false`, can OPEN the dashboard (200) but cannot list a product (403) -
and its cart still answers 200. 15 new tests, 821 in total.

### 9.1 The change

Today `User.role` is a single enum, so an identity *is* a role and one email
cannot both buy and sell. Rajat's own family shop is a seller on this platform
and also a customer of it — the model contradicts the business it runs.

**Role becomes a capability, not an identity.** The `Seller` document already is
the capability record: it carries `isApproved`, `kycStatus`, `status`. Nothing
new needs inventing. The user has a seller capability if a Seller document
exists for them and is approved.

- The JWT carries the **active context**, not the user's permanent nature.
- `POST /api/auth/switch-context` re-reads the Seller record from the database
  and re-mints the token. It never trusts a context the client asks for.
- No endpoint reads a role from the request body. (OWASP calls the opposite
  pattern broken function-level authorisation; it is the most common way a
  marketplace gets a fake seller.)

**Evidence this is how it is done:** Etsy — *"You'll use this account to run your
shop and to buy from other makers on Etsy."* eBay: personal → business is an
account-type **upgrade**, one way. Auth0, Clerk and WorkOS all model this as a
membership record attached to a user, never as a field on the user. Nobody
ships `role: buyer | seller`.

### 9.2 What the interface does with it

One account, one sidebar, and the sidebar's contents come from what the account
can do:

- Customer only → orders, wishlist, addresses, and a single **"Sell on
  ShopMaster Pro"** entry at the bottom.
- Seller (approved) → a context switcher at the top of the sidebar. Switching is
  a page change, not a different login.
- Seller (pending) → the switcher shows, disabled, with the application status.
- Admin → unchanged; it stays a separate area.

### 9.3 Logged out

A visitor who has never signed in sees the customer sidebar and can browse
`/shop`, open any product, and add to cart. Sign-in is asked for at **checkout**
and nowhere earlier — a marketplace that demands a login before it shows a price
has no chance of a Google click converting.

> **Not researched.** The agent tasked with logged-out marketplace navigation
> died on a session limit. The above is a judgement call from how Amazon,
> Flipkart and Myntra behave, not from a written source. Cheap to change later.

---

## 10. Becoming a seller — an upgrade, not a signup

Reached from **"Sell on ShopMaster Pro"** inside an account that already exists.
The person is already signed in, so we ask only for what selling needs.

**Two tracks, because most small Jaipur sellers have no GSTIN:**

| Track | Who | What it means |
|---|---|---|
| **GSTIN** | Registered sellers | Normal. Sells anywhere in India |
| **Enrolment number** (Notification 34/2023) | Turnover under ₹40 lakh, PAN, no GSTIN | **Intra-state only** — a hard lock in code, not a warning in a paragraph. Rajasthan buyers only |

**A GST finding that closes off a route we discussed:** imitation jewellery is
**HSN 7117 — 3% GST, taxable, not exempt** (Notification 09/2025-CTR, Schedule
IV). The "sell only GST-exempt goods so no registration is needed" path does not
exist for this catalogue. Only lac/shellac, glass and plastic bangles are
nil-rated. **On the CA list.**

---

## 11. A CMS — not yet

Verdict: **premature.** ~50 products and six static pages do not justify one.
The trigger for a CMS is *a non-technical person who needs to publish*, not a
number of pages — and today the only publisher is the developer.

For the record, so it isn't re-researched: Sanity Free and Contentful Free are
both genuinely $0 and would work. Strapi Cloud has no free tier. Payload is MIT
and self-host only (and has joined Figma). None of that changes the verdict.

---

## 12. Hosting the Next app — what to create, when, and what it costs

### What exists today, and it is right

| Service | Type | Plan | Carries |
|---|---|---|---|
| `shopmaster-pro` | **Static Site** | Free | `shopmasterpro.in` + `www.shopmasterpro.in`, both verified, both with certificates. Apex redirects to www |
| `shopmaster-api` (Singapore) | Web Service | Free | `shopmaster-api-sg.onrender.com` |
| `shopmaster-api` (Virginia) | Web Service | Free | The old API. Delete once Singapore has run clean for a few days |

The DNS is two CNAMEs (`@` and `www`) at Hostinger pointing to
`shopmaster-pro.onrender.com`, with `216.24.57.1` as the A-record alternative.
That is exactly how Render's own documentation says to do it, and both are
showing *Verified · Certificate Issued*. **Nothing here was done wrong.**

The React app reads exactly two environment variables, and both are correct:
`VITE_API_URL` (the Singapore API) and `VITE_RAZORPAY_KEY_ID`. The Razorpay
**key id** is public by design — it is meant to be in the browser. The *secret*
is not here, and must never be.

### Why the Next app cannot simply take a free service

A static site is always on. A **free Web Service is not**: it spins down after
15 minutes of no traffic, and the next request waits ~50 seconds for it to wake.

Googlebot treats a server that takes 50 seconds as an unhealthy one, and it
crawls a shop with a handful of visitors a day at exactly the times it is
asleep. Moving to Next in order to be indexed better, and landing on a service
that is asleep whenever Google calls, would leave us **worse off than the
static site we already have**.

> *Recorded earlier and NOT re-verified today: that Render also serves a
> `Disallow: /` robots.txt for a spun-down free service. The cold start alone
> settles the decision, so this was not worth re-testing.*

**Static export (`output: 'export'`) is not the way out.** It would give up
exactly what we moved for: pages rendered per request, on-demand revalidation
when a price or stock changes, and the API proxying the product page needs.

### So the plan is

| When | What |
|---|---|
| **Now → the pages are built** | Nothing on Render. `npm run dev` locally is enough, and every page so far is static HTML anyway |
| **Optional, any time** | A **free** Web Service named `shopmaster-web`, on its `onrender.com` subdomain, **no custom domain**, so it can be opened on a phone. It must ship `noindex` while it is a preview: two copies of the shop in Google's index is a self-inflicted duplicate-content problem |
| **Cutover, October 2026 at the earliest** | Upgrade that service to **Starter (~$7/mo)** and move the domain to it. It cannot happen sooner: the card was removed from the workspace and Render will not accept a new one until **1 Oct 2026** |

### The cutover, in order — nothing here is guesswork

1. Next service on **Starter** and confirmed awake on its `onrender.com` URL
2. Its environment set: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`,
   `NEXT_PUBLIC_SITE_URL=https://www.shopmasterpro.in`
3. `noindex` removed
4. Move `www.shopmasterpro.in` **and** `shopmasterpro.in` from the static site
   to the Next service; re-verify both, wait for both certificates
5. Watch Search Console for a week. **Keep the static site running** — it is
   free, and it is the way back if something is wrong
6. Only then delete `frontend/` from the repo

**The one thing that must not change across the cutover: the URLs.** Every
product URL, every category URL and all six policy URLs stay exactly as they
are. A redesign that also renames pages throws away whatever ranking those
pages have earned, and this shop cannot afford to lose any.

---

## 13. Where the work has actually reached

Updated as it moves. The order is section 7's.

| # | Step | State |
|---|---|---|
| 1 | Feed: `color`, `gender`, `age_group` | ✅ Live and verified — 17 items, 16 with a colour |
| 2 | Layout, header, footer, six policy pages | ✅ Built, all static. Not yet on a domain |
| 3 | `sort` on the products API + public delivery estimate | ✅ Built, 791 tests |
| 4 | `/products/[slug]` — the money page | ✅ Built and rendering live data. Server-rendered; price, stock, description and both JSON-LD blocks are in the HTML |
| 5 | `/shop` | ✅ Filters, server-side sort, removable chips, numbered pages, a real empty state. Filtered views carry `noindex, follow` |
| 6 | `/` | ✅ Hero with a CSS-only effect, categories from the live tree, newest products, the shop's real address, and the Organization record |
| 7 | Port the 30 private routes | ✅ **Done.** Customer, seller and admin - 36 pages, every React route mapped. See section 13a |
| 7a | Backend the interface needed | ✅ Google Sign-In, role-as-capability, become-a-seller, public seller pages, verified-buyer review check - all built and tested (sections 8.0, 9.0) |
| 7b | Things the React app never had | ✅ Search with suggestions (4.11), mobile drawer (4.6), panel sidebars (4.12), dark mode + new palette + jharokha mark (4.7, 4.9, 4.14), loading states (4.13), AI listing and photo tools for sellers (4.16), product form to the Shopify/Amazon standard, seller Dashboard/Orders/Settings to the same standard (4.19), `web/DESIGN.md` |
| 8 | Cutover - see section 12 | ☐ **The only thing left.** Blocked until Oct 2026 (paid Render web service). Production still serves the React app; `web/` runs on localhost only |

**Owed on the product page, and deliberately not faked:**

- **Verified-purchase badges.** The plan asks for them; the `Review` model has
  no such field. Rather than print a badge that means nothing, the reviews show
  name, date, rating and text only. Adding the flag is backend work: set it when
  the reviewer has a delivered order containing that product.
- **No image showing a piece worn, and no dimension slide.** Both are Baymard
  findings worth acting on and both need photography, not code.

Backend work that the interface needed (section 7a) - Google Sign-In,
role-as-capability, seller onboarding - is done; see the table above.

**Still open, and Rajat's call:** the seller RTO/performance page (when), a
buyer-protection line on the product page (copy), buyer-seller messaging
(large; later). The verified-purchase badge is a small backend flag and can be
done any time.

---

## 13a. Before `frontend/` can be deleted

Rajat's plan, confirmed 7 Sep 2026: **the React app goes entirely.** `web/`
serves the domain, Render runs it, and `frontend/` is removed from the repo.

The React app answers **37 routes**. As of 8 September 2026, **every one of them
has a home** - `web/` has 36 pages, plus redirects for the paths that were
renamed. What follows is the mapping, so the deletion can be checked rather than
felt.

| React route | Next route | |
|---|---|---|
| `/`, `/shop`, `/products/:id`, 6 policy pages | same | ✅ server-rendered now |
| `/login`, `/register`, `/verify-otp` | `/login`, `/register` | ✅ verify is a step inside register |
| `/forgot-password`, `/reset-password` | same | ✅ **every password email links here** |
| `/customer/cart` → `/cart`, `/customer/checkout` → `/checkout` | | ✅ redirected |
| `/customer/orders`, `/customer/orders/:id` | `/orders`, `/orders/:id` | ✅ redirected |
| `/customer/orders/:id/bill` | `/orders/:id/bill` | ✅ Bill of Supply, print-styled |
| `/customer/addresses` → `/addresses` | | ✅ |
| `/customer/wishlist` → `/wishlist` | | ✅ |
| `/customer/dashboard` | `/orders` | ✅ redirected - that is what it was opened for |
| `/seller/dashboard` → `/seller` | | ✅ |
| `/seller/orders`, `/seller/orders/:id` | same | ✅ |
| `/seller/products`, `/seller/products/:id` | same, **plus `/seller/products/new`** | ✅ a seller can list a product at last |
| `/seller/earnings` | same | ✅ four numbers and the bank details |
| `/seller/settings` | same | ✅ pickup address, free delivery |
| `/seller/inventory-logs` → `/seller/inventory` | | ✅ |
| `/admin/dashboard` → `/admin` | | ✅ |
| `/admin/manage-sellers` → `/admin/sellers` | | ✅ approve, suspend, commission |
| `/admin/orders` | same | ✅ **and disputes, which had no screen before** |
| `/admin/payouts` | same | ✅ |
| `/admin/categories`, `/admin/coupons` | same | ✅ |
| `/admin/inventory-logs` → `/admin/inventory` | | ✅ |

**Old URLs are 308 redirects** in `next.config.mjs`. They are behind a login so
there is no ranking to lose - but a customer who bookmarked their orders page
and gets a 404 has no way to know the shop still works.

**What is NOT parity, and is deliberate:**

- **Toasts.** The React app popped a toast for every action. Here the answer
  appears next to the thing that caused it, in an `aria-live` region. A toast
  that has already faded is an error message nobody read.
- **`/customer/dashboard`.** A page of links to other pages. The header does
  that.
- **Size filter.** Never existed; now needed because clothing sellers are
  coming. Backend work, recorded in section 3.5a.

## 13b. What "moving to shadcn" actually meant

The move is not cosmetic and it is not a component library for its own sake:

- **Every button is `<Button>`**, with variants (default, outline, ghost, link,
  destructive) instead of nine different hand-written class strings that had
  already started to disagree with each other.
- **Every text field is `<Input>` / `<Textarea>` with `<Label>`**, so focus
  rings, invalid states and disabled states are defined once.
- **Native `<select>` is KEPT deliberately.** shadcn's Select is a rich Base UI
  component, and on a phone the native element opens the operating system's own
  picker - faster, familiar, and accessible without any work. A custom
  dropdown is worth it only where the options need pictures or grouping, and
  none of ours do.
- **The codemod that did it is recorded here because it went wrong once:**
  the first version matched `<button ... >` with a regex, and an `onClick`
  containing an arrow function has a `>` inside `=>`. It cut five files in
  half. The second version walks the tag, tracking quotes and brace depth, and
  only treats a `>` at depth zero as the end. Regexes cannot parse JSX.

---

## 14. The three panels, and who each one is for

> **Status, 12 Sep 2026.** Written 7 Sep as the research that decided the
> panels. The ❌ and ⚠️ cells in the tables below are **what was true that day**:
> every screen they list as missing has since been built (`/seller/products/new`,
> `/seller/earnings`, `/admin/sellers`, `/admin/orders` with disputes,
> `/admin/payouts`, `/admin/categories`, `/admin/coupons`). What is still open
> from this section — the RTO/performance page, POD evidence on the dispute
> screen — is in `WHAT-IS-LEFT.md`. The rules in 14.4 stand.


Written 7 Sep 2026, after Rajat pointed out - correctly - that this was the one
part of the plan with no research behind it. The customer research in section 4
was done; the seller and admin research died on a session limit and was recorded
as unverified in section 14. This closes that hole.

The audiences narrow at every step, and so does what each panel owes its user:

| Panel | Seen by | What it is judged on |
|---|---|---|
| Customer | Everyone, most of them from Google | Whether a stranger trusts it enough to pay |
| Seller | A handful of people, daily, for hours | Whether the day's work can be finished without leaving the page |
| Admin | Rajat, and later one or two others | Whether he can find out what happened, and put it right |

### 14.1 What the seller panels of Amazon, Flipkart and Meesho actually contain

Read from their own documentation and guides, not from memory:

- **Amazon Seller Central** — top navigation is Catalog, Inventory, Orders,
  Advertising, Reports, Performance; the left menu adds Pricing, Growth,
  Analytics, Shipments, Payments, **Account Health**, Brands and Learn.
- **Flipkart Seller Hub** — order management (accept, process, message the
  buyer), inventory and catalogue, and a payment/account-health overview.
- **Meesho Supplier Panel** — Orders sorted by state (new, dispatched,
  delivered, cancelled), Catalog with a price recommendation tool, **Payments
  with settlement schedule, TDS and reconciliation against bank credits**, and
  **Returns/RTO** with quality flags, where a high RTO rate demotes a listing.

**The shape common to all three: Orders → Catalogue → Payments → Returns →
Performance.** Everything else is theirs to sell (advertising, brand tools).

### 14.2 What we have, and what is missing

| Their section | Ours | Verdict |
|---|---|---|
| Orders by state | ✅ `/seller/orders`, per-fulfilment status, ship / cancel / return actions | Done |
| Catalogue | ⚠️ list + stock only | **Add/edit product is missing** - a seller cannot list anything without an admin |
| Payments / settlement | ⚠️ per-order payout state | **No payments PAGE**: no settlement list, no "what is coming and when", no reconciliation. `/seller/earnings` and `/seller/payout-details` exist and nothing calls them |
| Returns / RTO | ✅ actions in the order card | Done, but no separate view and **no RTO rate** |
| Performance / account health | ❌ | The one to copy last, and the one that matters when there are three sellers instead of one |
| Advertising | ❌ | Not ours to build. Deliberately never |

**The single largest gap is a seller cannot add a product.** Every one of the
three panels is built around that action; ours has an API for it (`POST
/seller/products`) and no screen.

### 14.3 The admin panel is a different job

Sharetribe and Mirakl describe the operator's panel as: **user management,
transaction monitoring, dispute handling, commission and product approval,
vendor onboarding, and settings**. Not a bigger seller panel - a *supervisor's*
panel.

Our API already has all of it, and none of it has a screen in `web/`:

| What an operator must be able to do | Our endpoint | Screen |
|---|---|---|
| Approve, reject, suspend, reactivate a seller | `/admin/sellers/*` | ❌ |
| Set one seller's commission | `PATCH /admin/sellers/:id/commission` | ❌ |
| Look at any order, and cancel one | `/admin/orders`, `/admin/orders/:id/cancel` | ❌ |
| **Decide a dispute** | `POST /admin/orders/:id/dispute/resolve` | ❌ |
| See who is owed money, and pay them | `/admin/payouts/payable`, `/admin/payouts`, mark paid/failed | ❌ |
| Categories | `/admin/categories` | ❌ |
| Coupons | `/admin/coupons` | ❌ |
| Platform analytics | `/admin/analytics` | ❌ |

**The order these get built, and why:**

1. **Payouts** - real money, owed to real people, and today it is settled by
   reading the database. Nothing else on this list can lose someone their
   earnings.
2. **Disputes** - the referee. A customer and a seller disagreeing has no
   resolution path in the new app at all.
3. **Sellers** - approve, suspend, set commission. Needed the day Rajat's friend
   applies, which is the reason this section exists.
4. **Orders** - look anything up, cancel when it has gone wrong.
5. **Categories and coupons** - housekeeping. Rare, and survivable by hand.
6. **Analytics** - last. It is the only one where being wrong costs nothing.

### 14.4 The rules all three panels share

- **The server decides, the panel draws.** Every button's existence comes from a
  flag the API sent - `canCancel`, `canReturn`, `canDeclareDelivered`. A button
  that promises what the API will refuse is worse than no button, and this
  codebase has shipped that bug twice already.
- **Server error text is shown verbatim.** "Wallet balance too low" is
  actionable; "something went wrong" has somebody pressing the same button all
  afternoon.
- **Money is shown per seller, never per basket.** In a split order the basket
  total is partly another seller's money.
- **Anything that spends money is a button with a confirmation** - booking a
  courier, booking a return pickup. Never a side effect of a status change.
- **noindex, nofollow on both panels.** Neither is meant for search, and every
  crawl of them is crawl budget this shop does not have.

---

## 15. What we could not verify

Written down so nobody later mistakes it for fact:

- **Jewellery return rate ~4%** — single unverified source, and commercially the most important number here. Measure it from our own orders before writing policy around it.
- **India mobile traffic share** — StatCounter read directly says 64.45% (Aug 2026); blogs routinely attribute 76–80% to the same source. Using ~65% as a conservative floor.
- **"Sticky add-to-cart lifts mobile conversion 5–12%"** and **"Baymard thumb-zone research"** — both are widely quoted and **neither exists**. We are adding the sticky bar because all three D2C competitors have it, not because of a number.
- **Delivery-date conversion lifts (+12% to +25%)** — all vendor case studies, no controlled research.
- **Legal Metrology (Packaged Commodities) Amendment Rules 2026**, in force 1 July 2026, reportedly require country of origin, net quantity, manufacturer name and address to be displayed by e-commerce entities, and possibly a country-of-origin *filter*. Melorra, Palmonas and Myntra all show such a block today. **The gazette text could not be retrieved. This is a question for a lawyer, and it is on the CA list.**
- **Logged-out marketplace navigation** - that research pass was cut off by a session limit and never returned findings. (The seller/admin panel research was re-run on 7 Sep and is now section 14.) What section 9.3 says about logged-out browsing is reasoning from competitor behaviour, not a sourced finding. Worth a re-run before the sidebar is built.

### 4.31 Admin → Google (12 Sep 2026)

**Reference:** Search Console's *Pages* report (counts on top, table sorted problems-first) and Merchant Center's *Needs attention* list, joined on our product id. **Goal:** liquidity — a product page Google has not indexed or Shopping has disapproved sells to nobody, and until today nobody could see which ones.

- `GET /admin/google/products` — one Merchant Center listing call + URL Inspection per product (6 at a time, per-URL memory 12 h, whole answer 6 h; first request answers `202 building`, the page polls). Three tiles (in the index / approved for Shopping / checked when + *Ask Google again*), then the table: product · seller · Google index (with Google's own coverage state) · Shopping (with the issue text and Google's "how to fix" link) · last crawl. Tabs *Needs attention* / *All products*.
- Honest about the cutover: today every row is "URL is unknown to Google" because the `/products/<slug>` addresses go live in October; the tile says exactly that instead of showing a red zero.
- Also today: Atlas Search behind the suggest box and the shop search (`utils/atlasSearch.js`, regex fallback), the Shopping | Selling | Admin RoleSwitch in both headers, `backupDb.js` / `ensureSearchIndex.js`, product schema names the shop as the seller (G4 verified).