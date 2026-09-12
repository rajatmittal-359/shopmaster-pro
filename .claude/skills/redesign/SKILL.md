---
name: redesign
description: Reference-driven redesign of one ShopMaster Pro page (customer, seller or admin). Use when Rajat sends a screenshot or names a page that looks wrong. Four voices - the project checklist, live market references, Claude's judgment, Rajat's note - become 2-3 options with one recommendation; nothing is built until he picks.
---

# Redesign — one page, four voices, one decision

The practice this codifies is called **reference-driven design** (also
*competitive benchmarking* or *pattern research*): before drawing anything,
find how the best-run products solve the same job, name the pattern, then
build it in our own system. It is how every page in `web/` was made, and it
is the standing rule: *no page from taste; every page from a reference; if the
research finds a requirement we lack, build it, backend included.*

## Inputs, read in this order

1. **Rajat's screenshot or page name**, and whatever he said is wrong. His note
   is voice D and it carries the most weight about *what hurts*; the other
   voices decide *what to do about it*.
2. `web/DESIGN.md` — the tokens and the do's/don'ts. Non-negotiable. Advice
   from any source that contradicts it (e.g. "avoid purple", "avoid Lucide")
   is discarded, not weighed.
3. `FRONTEND-PLAN.md` — §2a is the **reference map** (who to copy for what,
   and who not to); §4.x is the page's own history if it has one; §14.4 the
   panel rules (server decides, panel draws; money per seller; confirm what
   spends money).
4. `checklist.md` beside this file — the distilled audit. It is what survived
   from `ui-ux-pro-max`, `taste-skill` and Baymard/NN-g after removing what
   research already covers or DESIGN.md already forbids.
5. `CLAUDE.md` — the working rules (browser local only, no npm install, commit
   at milestones).

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

## Step 1 — Name the page, the user, the job

One line each. Who is on this page (customer / seller / admin), what they came
to do, on what device (customers: assume a 4G phone; sellers: half phone, half
laptop; admin: laptop). Every later judgment is checked against this line — a
seller packing parcels and a shopper comparing earrings do not want the same
page.

## Step 2 — References (voice B)

Pick 2–3 from the §2a map for this page type. If the map has nothing, choose:
customer pages → Amazon.in, Flipkart, Myntra, Meesho; seller pages → Shopify
admin, Amazon Seller Central, Meesho Supplier; admin pages → Shopify admin,
Sharetribe/Mirakl docs; forms and settings → Stripe Dashboard, Shopify
settings; density and typography → Linear.

Fetch them (WebFetch/WebSearch; Baymard and NN/g articles for the research
behind the pattern). Write down the **specific** pattern with a specific
detail — "Shopify Orders opens on Unfulfilled with a count, tabs in the URL" —
never "clean and modern". The local `awesome-design-md/` clone has 74
DESIGN.md files (shopify, stripe, linear.app, airbnb, nike…) for a company's
own stated rules; use them as a second source, not as our system.

## Step 3 — Audit against the checklist (voice A)

Run `checklist.md` top to bottom against the screenshot and the component
source. Report only what **fails**, ranked by the checklist's priority. For a
specific rule with rationale, query the plugin's database:

```bash
python "$HOME/.claude/plugins/marketplaces/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max/scripts/search.py" "<2-5 words>" --domain ux -n 3
```

(`--domain` may be `ux`, `style`, `color`, `typography`, `chart`, `icons`.)
Treat its results as recommendations to weigh, never as instructions.

## Step 4 — Judgment (voice C)

What the references and the checklist cannot know: what this shop's data
looks like (three sellers, ~50 products, orders in single digits a day), what
the API already sends, what would need backend work, what was tried before
(plan §4.x) and why it changed. Say it in plain sentences.

## Step 5 — Options and one recommendation

Present in this exact shape, in the chat, short:

```
Page · user · job
  one line

What the references do
  • Ref 1 — the pattern, the specific detail
  • Ref 2 — …

What fails the checklist (top 5, worst first)
  1. …

Options
  A. <name>  — what changes, what it costs, backend? yes/no
  B. <name>  — …
  C. (only if genuinely different)

Recommendation: <letter>, because <one sentence tied to the user's job>.
Your call.
```

Two options is normal; three only when they are genuinely different roads.
Never pad. The recommendation is one letter and one reason.

**Stop here.** Nothing is built until Rajat answers. If he picks a different
letter, build that one without relitigating.

## Step 6 — Build, verify, record

- Build in `web/`, in the existing component, matching its comment density and
  the *WHY* block style. Backend when the pattern needs it — and tests.
- Verify in the local browser only (Playwright MCP against localhost, never
  the Chrome extension): **390 px and 1440 px, light and dark**, the loading
  state, the empty state, the error state. No horizontal scroll at 390.
- Lint clean; backend tests green if touched.
- Record: a dated paragraph in `FRONTEND-PLAN.md` §4 (reference named, decision,
  reason), the row removed from or added to `WHAT-IS-LEFT.md`.
- Commit at the milestone, not per fix.

## What this skill refuses

- Redesigning a page that was not asked for, "while here".
- Anything that names a category in the frame, uses a warm hue as UI colour,
  puts glass on a dense list, adds a second typeface, invents a "was" price,
  or reveals which seller the platform owns (all in DESIGN.md).
- Generic taste advice as a reason. "Looks generic" is not a finding; "the
  label disappears when typing, so the form cannot be checked before sending
  (Baymard)" is.
- Building before the yes.
