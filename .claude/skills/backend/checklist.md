# The backend audit checklist

What survived from `superpowers` (TDD, systematic debugging, verification),
`pr-review-toolkit` (silent failures), `claude-code-owasp` (Top 10:2025 review
lists, JS quirks) and `everything-claude-code` (backend patterns), after
removing what the house rules in `SKILL.md` §0 already say and what does not
apply to a three-seller shop on one Render instance. Priority order is the
order to report in. Each line has a pass/fail answer.

## P1 — Access control and identity (OWASP A01, A07)

- Every route is behind `authMiddleware` + the role check it needs
  (`roleMiddleware`, `checkSellerStatus` / `requireApprovedSeller`); public
  routes are public on purpose and say so in a comment.
- **Ownership on every object**: `Order.findOne({ _id, customerId: req.user._id })`,
  `items.sellerId` compared to `req.user._id`, product's `sellerId` checked
  before edit. Never trust an id in the body to belong to the caller.
- Admin-only fields cannot be set through a seller or customer route
  (commission, approval, payout state, `isPlatformOwned`).
- Deny by default: an unknown status, role or action is refused, not passed.
- Passwords bcrypt; tokens from `JWT_SECRET` only; Google ID tokens verified
  against the audience; password-reset tokens single-use and expiring.
- Rate limiting on login, forgot-password, register, checkout, the AI routes
  (open item 2.10 — until it exists, say so in the review).

## P2 — Input (OWASP A05, JS quirks)

- Every body field the handler uses is validated or whitelisted; extra keys
  are ignored, never spread into an update (`Object.assign(doc, req.body)` is
  prototype pollution waiting — `__proto__`, `constructor`).
- Ids: `mongoose.isValidObjectId` before a query; strings length-capped;
  numbers `Number.isFinite` and range-checked (price ≥ 0, quantity ≥ 1, PIN
  `^[1-9]\d{5}$`).
- Sort / filter keys through a whitelist map; regex input through
  `escapeRegex`; `$`-prefixed keys never reach a query from the client.
- HTML fields refused by allowlist at the model (`validateSync` before any
  paid side effect such as an upload).
- Uploads: type checked from bytes or a trusted content type, size capped
  (express.json is 10 MB; base64 inflates ×1.33), Cloudinary URLs recognised
  by `isOwnUrl` before being kept as-is.

## P3 — Money and state (house rules made checkable)

- The number shown to a seller comes from `sellerMoneyFor`; commission is the
  stamped `commissionAmount`, never today's rate.
- A refund is created through `utils/refund` and its id stored; a failure to
  refund aborts the transaction (no "cancelled but still charged").
- A state change checks the state it is leaving (`CANCELLABLE`, `['shipped',
  'delivered']`) and is refused otherwise with the reason in words.
- Anything that spends (courier booking, return pickup, premium AI image) is
  a deliberate call behind a confirmation on the page, never a side effect.
- Webhooks: signature verified, event id or state compared, handler safe to
  run twice, forward-only transitions.
- Multi-document writes that must agree (stock + order + inventory log) run
  in one `session` transaction; single-document writes do not pay for one.

## P4 — Errors (OWASP A10, silent-failure rules)

- `catch (err) { return sendError(res, err) }` — or a specific status with a
  specific sentence. Never a bare 500 with `err.message`, never a stack.
- No catch swallows: every catch either rethrows, returns an error response,
  or logs with the ids that let someone debug it in six months — and says
  *why* continuing is safe (e.g. email failed after the order was saved).
- No fallback to a mock, a default, or "the last known value" on an error
  path unless the WHY block justifies it and the caller can tell.
- Error text: what happened, what works next, in the shop's voice.
  Consistent shape `{ message }` (plus fields when the page needs them, e.g.
  `windowClosedAt`). No enumeration leaks (same answer for unknown email and
  wrong password).
- 5xx logged with context (`console.error` with order number / user id);
  4xx not logged as errors.

## P5 — Data protection and configuration (OWASP A02, A04, A09)

- Secrets only from `process.env`; nothing key-shaped in code, tests, logs or
  URLs. `.env.example` lists every variable the code reads.
- `noStore` on authenticated responses (already global); CORS from
  `FRONTEND_URL`, not `*`.
- `helmet` at the top of `app.js` (open item 2.10).
- Dependencies: `npm audit` clean or explained; no `--force` upgrades without
  the test run.
- Security events logged: failed logins burst, role changes, payout marked
  paid, dispute decided.

## P6 — Tests (TDD, verification)

- The failing test was watched failing, for the missing behaviour.
- The test names the production change that would break it; asserts on
  behaviour, not on the mock having been called.
- Money paths tested with a split order (two sellers) — that is where every
  past bug lived.
- No test needs a network, a database, or a real key; `tests/setup.mjs` stays
  the only place environment is set.
- The claim "tests pass" is accompanied by the run's last lines (files, tests,
  0 failed). "Should pass" is not a state.

## P7 — Structure (`code-structure` leftovers)

- Business logic in a controller or `utils/`, not in `routes/`
  (`productRoutes.js` is the known exception — open item 2.11; do not add to it).
- A rule that two places need lives in one helper both import (see
  `canCancelOrder`, `customerMayDispute`, `sellerMoneyFor`, `returnWindowFor`).
- Express 5: async handlers may throw — but this codebase catches explicitly
  and calls `sendError`; follow it.
- Mongoose 9: check `context7` for any option you have not used in this repo
  before (strictQuery, `populate` shapes, `session` handling).

## Per-caller checks

| Caller | Ask this of the endpoint |
|---|---|
| Customer | Can they reach only their own orders, addresses, cart, reviews? Is every refusal a sentence they can act on? Does the flag the page draws come from the same helper that refuses? |
| Seller | Is every number their own share? Can a suspended seller still act? Does anything let them move stock, status or money that is not theirs? |
| Admin | Is the irreversible thing (payout paid, dispute decided, seller suspended) logged with who and why? Is evidence (POD, reasons) returned with the case? |
| Webhook / cron | Signed? Safe twice? Forward-only? Logged with the external id? |
