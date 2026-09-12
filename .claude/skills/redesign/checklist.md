# The audit checklist

What survived from `ui-ux-pro-max` (119 rules), `taste-skill`'s redesign
audit, Baymard and NN/g, after removing what the reference research already
answers and what `web/DESIGN.md` already forbids. Priority order is the order
to report in. Each line is a test with a pass/fail answer, not a mood.

## P1 — Can everyone use it

- Text on its background ≥ 4.5:1 (large text ≥ 3:1). Check glass surfaces
  over photos and every "muted" line especially.
- Nothing said by colour alone: a status has a word, an error has text, a dot
  has a label.
- Every icon-only control has an accessible name; every image that carries
  meaning has alt text; decorative ones have `alt=""`.
- Focus is visible on every interactive element; Tab order follows reading
  order; Escape closes what Enter opened.
- Touch targets ≥ 44 × 44 px with ≥ 8 px between them on the customer side.

## P2 — Does it tell the truth while working

- Loading: a skeleton that mirrors the final layout, invisible for the first
  300 ms, `aria-busy` on the region. Never "Loading…" text, never a spinner
  for a page.
- Nothing jumps when data arrives: images have `aspect-ratio`, counts have a
  reserved slot, async badges do not push toolbars.
- Empty: says what would appear here and offers the one action that fills it.
- Error: the server's own words, next to the thing that failed, with the way
  forward. No "Something went wrong", no "Oops", no exclamation marks.
- Every submit shows working → done/failed. A save bar knows when there is
  nothing to save.
- Costly or irreversible actions confirm with a verb+noun button that names
  the cost; everything else is immediate with an Undo toast.

## P3 — Forms (Baymard)

- Label **above** the field, hint **below**, error beside — placeholders are
  never the label.
- `autocomplete`, `inputmode` and `type` set so a phone keyboard and autofill
  do the work.
- Only fields that belong together share a row (price · MRP · stock).
- Long forms: sections as cards, one primary action, sticky save bar.
- Named reasons first, free text second, for anything a customer will read.

## P4 — Layout and hierarchy

- One primary action per view; secondary is outline; tertiary is a text link.
- Page opens with title, one-line lead, the page's primary action on the right.
- Numbers in columns are `tabular-nums`; prices are the loudest number.
- Headings sentence case. No orphaned single word on a heading's last line
  (`text-wrap: balance`).
- Cards in a row align their titles, values and buttons on the same lines;
  buttons pinned to the bottom when content lengths differ.
- Body copy ≤ ~65 characters a line; product copy 15 px on 1.7.
- 390 px: no horizontal scroll, side gutter ≥ 16 px, grid children `min-w-0`,
  tables and chips scroll inside their own container.

## P5 — Navigation and state

- The current place is marked (sidebar item, tab, breadcrumb).
- A filtered or tabbed view lives in the URL so it can be linked and survives
  reload.
- Back does what the user expects; nothing traps focus without an exit.
- Search that matters is a visible field, not an icon.

## P6 — Motion and material

- Hover on anything clickable (shadow, tint or underline — never movement of
  layout); press feedback ~1 px; transitions 100–300 ms; `prefers-reduced-motion`
  honoured.
- Only `transform` and `opacity` animate.
- Glass only on things that float over content; never on a dense list.
- Depth from one light source; brand-tinted shadow on hover, hairline + 1 px
  shadow at rest.

## P7 — Words

- Category-neutral in the frame. Plain, specific, active voice.
- Verb + noun on buttons: "Book the courier", "Use as main photo".
- Money is the seller's own share, never the basket; commission shown, not
  silently deducted.
- No "Elevate / Seamless / Unleash / Next-gen"; no Lorem ipsum; realistic
  sample data in previews.

## Per-user checks

| User | Ask this of the page |
|---|---|
| Customer (4G phone) | Is the product photo the loudest thing? Can I tell price, delivery date and returns without scrolling? Is add-to-cart reachable with a thumb? |
| Seller (phone + laptop) | Can I see what is waiting on me *today* in the first screen? Does every number say whose money it is? Can I act from the list, or must I open each thing? |
| Admin (laptop) | Can I find one order/seller/payout by its number in one action? Is every ruling backed by evidence on the same screen (POD, reasons, timeline)? Is the irreversible thing confirmed and the rest undoable? |
