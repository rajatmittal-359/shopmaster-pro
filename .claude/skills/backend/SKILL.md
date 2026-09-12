---
name: backend
description: Reference-driven change to the ShopMaster Pro API (Express 5, Mongoose 9, vitest). Use for any new endpoint, changed rule, bug, or hardening in backend/. Four voices - the project checklist, how the market's APIs behave, Claude's judgment, Rajat's note - become options with one recommendation; the failing test is written before the code; nothing is claimed done without the command output.
---

# Backend — one change, four voices, test first

The same practice as `/redesign`, pointed at the API: before writing a rule,
find how the best-run marketplaces and payment systems state it (Amazon,
Flipkart, Shopify, Stripe, Razorpay's own docs), name it, then build it here
with a test that failed first. What was distilled from `superpowers`
(TDD, systematic debugging, verification), `pr-review-toolkit`'s silent-failure
rules, OWASP Top 10:2025 and MongoDB's guidance lives in `checklist.md`; what
is *ours* — the money and truth rules this codebase learned the hard way — is
in section 0 below and outranks all of it.

## 0. The house rules (from the code's own WHY blocks)

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
   (`SORTS[sort]`), regex through `escapeRegex`, HTML through the model's
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

## 1. Name the change

One line each: the endpoint or rule · who calls it (customer / seller /
admin / webhook / cron) · **whose money or stock moves** · what today's code
does (read it; `frontend/` is a capability inventory only, never a design).

## 2. References (voice B)

- **Behaviour**: how Amazon / Flipkart / Shopify / Meesho state this rule to
  their sellers and buyers (cancellation penalties, return windows, dispute
  gates, payout holds). `FRONTEND-PLAN.md` §2a is the reference map.
- **Mechanics**: Stripe's and Razorpay's docs for money (idempotency keys,
  refund states, webhook signatures); Shiprocket's for courier states.
- **Library truth**: `context7` for Express 5 and Mongoose 9 — *before*
  using an API from memory (Mongoose 9 changed defaults; Express 5 handles
  async errors and changed `req.query`).

Write the pattern with a specific detail, never "best practice".

## 3. Audit (voice A)

Run `checklist.md` against the change. Report only failures, worst first.
`security-guidance` already watches every edit and commit; that does not
excuse the checklist.

## 4. Judgment (voice C)

What the references cannot know: three sellers, one Render instance in
Singapore, orders in single digits a day, the cron on Render, the deferred
cleanup list. Say what is worth building *now* versus recording in
`WHAT-IS-LEFT.md`.

## 5. Options and one recommendation — then stop

```
Change · caller · money/stock at stake
  one line

What the references do
  • …

What fails the checklist
  1. …

Options
  A. <name> — what changes, which files, which tests, migration? yes/no
  B. <name> — …

Recommendation: <letter>, because <one sentence>.
Your call.
```

Nothing is written until Rajat answers. If he picks another letter, build it.

## 6. Build — red, green, verify, record

- **RED first.** One behaviour, one test, in an existing `tests/*.test.mjs`
  or a new one in that voice. Run it. It must **fail for the right reason**
  (missing behaviour, not a typo). A test that passes immediately is testing
  the present, not the change.
- **GREEN.** The smallest code that passes. Helpers in `utils/`, decision in
  one place, the flag and the endpoint sharing it.
- **Verify with output, not adjectives.** `npx vitest run` — 0 failures, the
  count stated. `npx eslint` if `web/` was touched. A bug fix reproduces the
  original symptom in a test before and after.
- **Debug systematically** when something resists: root cause before any
  fix; working example vs broken; one variable per hypothesis; three failed
  fixes = question the design, do not patch a fourth time.
- **Before commit**, on money or error-path changes: run the
  `pr-review-toolkit:silent-failure-hunter` agent on the diff. Before cutover:
  `/security-review` on the branch, and one `claude-security` scan.
- **Record**: WHY block above the code; a paragraph in `FRONTEND-PLAN.md` if
  the interface changed, or the OPS changelog if operations did; the row in
  `WHAT-IS-LEFT.md` removed or added. Commit at the milestone.

## What this skill refuses

- Code before the failing test, or "I'll add tests later".
- A 500 for a caller's mistake; a message that names the stack.
- A fallback that hides a failure (a mock in production, a swallowed catch,
  `|| defaultValue` on an error path).
- A seller-facing number that is the basket total.
- Any API call in a test that could reach a real service or database.
- `npm install` — Rajat runs installs.
- Claiming done without the command output in front of us.
