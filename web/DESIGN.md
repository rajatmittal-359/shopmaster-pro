---
version: 1
name: ShopMaster Pro
description: "A marketplace from Jaipur, built to sell anything. Cool violet-indigo frame, so warm product photography stays the loudest thing on the page; one warm accent - Jaipur pink - reserved for the mark and brand moments. The register is a platform, not a stall: Stripe's measured indigo, Linear's cool greys, generous whitespace, frosted glass only where something floats. Every decision here was researched first (Baymard, NN/g, and the storefronts of Amazon, Flipkart, Myntra, Meesho, Shopify) and then verified in the browser; the reasons live in FRONTEND-PLAN.md, the values live here."

colors:
  # Semantic tokens, as shipped in web/src/app/globals.css (oklch). Hex is the
  # sRGB rendering for tools that cannot read oklch.
  primary: "oklch(0.50 0.22 286)"          # ≈ #5B3FD6 - violet-indigo. L 0.50 is where white text clears 4.5:1
  on-primary: "oklch(0.99 0.003 286)"      # white
  brand-ink: "oklch(0.47 0.20 286)"        # ≈ #5237C8 - the same hue as TEXT on white (links, quiet emphasis)
  brand-from: "oklch(0.50 0.19 352)"       # ≈ #C4356F - Jaipur pink
  brand-via: "oklch(0.40 0.20 296)"        # ≈ #5B2BB0 - royal violet
  brand-to: "oklch(0.34 0.15 268)"         # ≈ #2E3A8C - royal blue
  brand-rose: "oklch(0.62 0.21 356)"       # ≈ #E0457B - the one warm accent
  canvas: "oklch(0.995 0.002 286)"         # ≈ #FDFDFE - near-white with a cool cast
  ink: "oklch(0.21 0.02 286)"              # ≈ #2B2A3B
  ink-muted: "oklch(0.53 0.02 286)"        # ≈ #7C7B8A
  surface: "oklch(1 0 0)"                  # cards
  muted: "oklch(0.968 0.005 286)"          # ≈ #F5F5F8
  accent: "oklch(0.955 0.016 292)"         # ≈ #F1EEF9 - hover fills
  hairline: "oklch(0.916 0.006 286)"       # ≈ #E7E6EC
  destructive: "oklch(0.58 0.23 27)"       # ≈ #E5484D
  # Dark mode is a first-class palette, not an inversion. Midnight with a
  # violet cast (uiGradients "Lawrencium" was the reference): a little chroma
  # in the ground is what makes the gradient belong on it.
  dark-canvas: "oklch(0.165 0.028 290)"    # ≈ #17142A
  dark-surface: "oklch(0.21 0.03 290)"     # ≈ #201C36
  dark-ink: "oklch(0.97 0.004 286)"
  dark-primary: "oklch(0.58 0.22 288)"     # lifted; white still clears 4.5:1
  dark-brand-ink: "oklch(0.78 0.15 290)"
  # Glass - rgba on purpose, composited over unknown content
  glass: "rgba(255,255,255,0.72)"
  glass-strong: "rgba(255,255,255,0.86)"
  glass-border: "rgba(255,255,255,0.70)"
  dark-glass: "rgba(23,21,36,0.72)"
  dark-glass-strong: "rgba(23,21,36,0.88)"
  dark-glass-border: "rgba(255,255,255,0.10)"

typography:
  # Geist (next/font, self-hosted) everywhere. One family: a wordmark or a
  # display face that waits on a webfont flashes on 4G, and most visitors are
  # on 4G. Weight and size do the hierarchy, not a second family.
  display:
    fontFamily: Geist
    fontSize: 48px          # sm:text-5xl on the home hero
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.02em
  h1:
    fontFamily: Geist
    fontSize: 30px          # text-2xl / text-3xl; tracking-tight
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.015em
  h2:
    fontFamily: Geist
    fontSize: 18px          # text-lg font-semibold - section titles inside a page
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: Geist
    fontSize: 15px          # text-[15px] leading-7 for product copy
    fontWeight: 400
    lineHeight: 1.7
  ui:
    fontFamily: Geist
    fontSize: 14px          # text-sm - buttons, nav, labels, table cells
    fontWeight: 500
    lineHeight: 1.4
  caption:
    fontFamily: Geist
    fontSize: 12px          # text-xs - hints under fields, timestamps
    fontWeight: 400
    lineHeight: 1.5
  eyebrow:
    fontFamily: Geist
    fontSize: 11px          # tracking-wider uppercase - sidebar group labels
    fontWeight: 500
    letterSpacing: 0.06em
    textTransform: uppercase
  price:
    fontFamily: Geist
    fontSize: 30px          # text-3xl font-semibold on the product page
    fontWeight: 600
    fontVariantNumeric: tabular-nums
  mono:
    fontFamily: Geist Mono
    fontSize: 13px

rounded:
  base: 12px      # --radius: 0.75rem
  sm: 7px         # ×0.6 - chips, small badges
  md: 10px        # ×0.8 - inputs, buttons, menu items
  lg: 12px        # cards, dialogs
  xl: 17px        # ×1.4 - hero tiles, the mark's tile (28% of side, iOS squircle)
  pill: 9999px    # filter chips, the model chip, action chips

spacing:
  unit: 4px
  field-gap: 20px     # gap-5 between form fields
  section-gap: 20px   # space-y-5 between cards on a form
  card-padding: 20px  # p-5
  page-gutter: 16px   # px-4
  container: 1024px   # max-w-5xl storefront; 1152px (6xl) shop grid; 1280px (7xl) panels
  sidebar: 224px      # w-56
  header: 56px        # h-14

elevation:
  card: "0 1px 2px rgba(0,0,0,0.04)"                          # shadow-xs; a border does the rest
  glow-hover: "0 1px 2px rgba(0,0,0,0.06), 0 12px 28px -12px var(--brand-via)"
  menu: "shadow-lg + ring-1 ring-foreground/5"
  glass-blur: "blur(16px) saturate(150%)"                     # via @apply - see the note under Effects
---

## Overview

ShopMaster Pro is a multi-vendor marketplace run from Jaipur. The brand promise
is **variety** - clothing, jewellery, home, electronics, whatever the next
seller brings - so the frame around the products must never name a category
and must never compete with them. That single constraint decides most of what
follows: a cool palette, one warm accent held back for the mark, product
photography given the width, prose kept to a line.

The register is a platform, not a stall. The references are the storefronts
people already trust (Amazon, Flipkart, Myntra, Meesho) for patterns, and the
software this generation respects (Stripe, Linear, Vercel) for the colour and
the restraint. The seller and admin panels follow Shopify's admin and Amazon
Seller Central: a separate application with its own slim bar, never the shop's
header on top of a dashboard.

Jaipur is in the identity on purpose and with restraint: the mark is a
jharokha - the arched window Hawa Mahal is five storeys of - lit pink from
inside on the brand-gradient tile. The city was painted terracotta in 1876 to
welcome a visitor, and that is why the world calls it the Pink City. No lotus,
no chakra, no clip-art; the city's own domestic form, and its own colour.

## Colors

### Brand & Accent

**Violet-indigo** (`primary`) is the one colour that means "act". It sits at
oklch L 0.50 precisely because that is where white text clears WCAG 4.5:1 - one
button style everywhere instead of two. `brand-ink` is the same hue taken down
until it reads as text on white (4.8:1): links, quiet emphasis, the "Pro" in
the wordmark.

**The brand gradient** is three analogous stops - Jaipur pink → royal violet →
royal blue - with the violet between so pink and blue never meet directly;
that meeting is where a gradient turns muddy. It was chosen from
gradienthunt's most-liked set and uiGradients' catalogue (closest: "Celestial",
#C33764 → #1D2671), then darkened until white text sat on it comfortably. It is
a **token**, used only on brand moments: the mark, the sign-in panel, the home
blooms. Everywhere else is neutral.

**Why not marigold.** The first palette was Jaipur's own marigold. It failed on
two counts that could not be designed around: too light to carry white text
(2.8:1), forcing dark ink on every button and a warm retail-catalogue feel
through the whole interface; and warm, on top of product photography that is
itself warm - jewellery, fabric, skin. The frame competed with the goods.

### Surface

Near-white canvas with a barely-there cool cast; pure white cards on it, so a
card is a card and not a border. Muted (`0.968`) for grounds that need to
recede - the form side of the sign-in screen, a panel's page background.
Accent (`0.955`, a touch more chroma) is the hover fill, and nothing else.

### Dark Mode

A real palette, defined token by token, not an inversion. The ground is
midnight with a violet cast rather than pure black: pure black next to a bright
violet vibrates, and it makes a product photograph look like it is floating in
a hole. Primary lifts to L 0.58 because on a dark ground the readable
direction is up. `system` is the default - the best theme is the one the
person already chose on their phone - with one toggle in the header. The
toggle renders both icons and lets the `dark` class hide one: no mounted flag,
no flicker.

### Text

Ink at L 0.21 with a hint of hue, never `#000`. Muted ink at L 0.53 for hints
and secondary lines (4.6:1 on white). Destructive at L 0.58 for the one message
that must be read.

## Typography

### Font Family

**Geist** for everything, **Geist Mono** for order numbers and codes. Both are
loaded through `next/font` and self-hosted, so nothing waits on a third-party
request. One family was a deliberate choice: hierarchy comes from weight
(400/500/600) and size, and the wordmark is set in the page's own font so it
never flashes.

### Hierarchy

Display (48px, 600, -0.02em) is the home hero only. Page titles are 30px
semibold with tight tracking; section titles inside a page are 18px semibold;
UI text (buttons, navigation, labels, table cells) is 14px medium; product copy
is 15px on a 1.7 line-height, which is what long Indian product names and
two-paragraph descriptions need to breathe. Prices are 30px semibold with
tabular numerals so a column of them aligns.

### Principles

- **One line, then the goods.** People do not arrive to read; they arrive to
  see whether there is anything here for them. The home hero is one sentence
  beside a wall of six live products; the sign-in panel is one line beside
  the same wall. Every paragraph that used to sit there is still true and still
  on the policy pages - it was never why anybody stayed.
- **Copy is category-neutral.** "A marketplace from Jaipur, delivered across
  India." Never "a jewellery shop", never which seller the platform owns.
- **Say the real thing.** Error and empty states name what happened and what
  works next - "Today's free AI image allowance is used up across the whole
  platform. It refills overnight" - not "Something went wrong".

## Layout

### Spacing System

4px base. Fields sit 20px apart; cards on a form 20px apart with 20px inside;
page gutter 16px. The storefront reads at `max-w-5xl` (1024px), the shop grid at
6xl, the panels at 7xl with a 224px sidebar. The header is 56px and sticky.

### Grid & Container

Product grids are 2 columns on a phone, 3 at `sm`, 4 at `lg`, square tiles.
Forms are a single column at `max-w-3xl`, with 2- or 3-up rows only for fields
that belong together (price · MRP · stock). The sign-in screen splits
`1.1fr / 1fr` above `lg` and becomes the card alone below it.

### Whitespace Philosophy

Generous between sections, tight inside a component. A form section is a card
with room around it, not a heading in a stream. Panels get a muted page ground
so white cards have something to sit on.

## Elevation & Depth

Almost none, by default. A card is a hairline border and a 1px shadow; the
border does the work. Depth appears in exactly three places:

1. **Glass** on things that float over content - the header, dialogs, the
   drawers, menus, the product page's sticky buy bar. 16px blur (above ~20 it
   is a cost on a cheap phone, not a look), saturation lifted so what is
   behind stays colour rather than photocopy, and a fill opaque enough to be
   the **barrier layer** that keeps text above 4.5:1. `@supports` falls back to
   opaque; `prefers-reduced-transparency` is honoured. **Never on a dense
   list** - the search suggestions and the model picker are solid, because
   that is exactly where translucency drops below 4.5:1.
2. **Glow on approach** - a hover shadow in the brand colour, not grey. Grey
   says "raised"; brand-coloured says "live". It is a shadow, so nothing moves.
3. **Mesh + grain** on the one large brand surface (the sign-in panel):
   layered radial gradients, which is how a mesh gradient is actually built in
   CSS, with an inline SVG turbulence at `mix-blend-mode: overlay` so the
   panel reads as a material rather than a render.

### The aurora

Two very faint fixed blooms behind the whole site (pink top-left, royal blue
top-right), because glass has nothing to frost over a flat page. Low enough
that a white kurta on a product card is not tinted; the moment it is, it is too
strong.

## Shapes

12px base radius (`--radius: 0.75rem`). Buttons and inputs at 10px, cards and
dialogs at 12px, hero tiles at 17px, chips and the model selector as pills.
The mark's tile is a rounded square at 28% of its side - the iOS squircle
proportion, which is why it reads as an app icon beside real ones.
Product images are squares: every card, gallery tile and Google's feed shows a
square, and the cropper's guide is Amazon's 85% rule.

## Components

### Buttons

Primary: violet fill, white text, 10px radius, `h-10` in forms and `h-9` in
bars. One primary per view. Outline for the secondary action beside it; ghost
for cancel and for anything in a toolbar. Destructive appears only inside a
confirm that names what is being destroyed. Labels are verb + noun: "Save
changes", "List it", "Make it", "Use as main photo".

### Cards & Containers

White on the canvas, hairline border, 12px radius, 20px padding, `shadow-xs`.
A card carries a title and an optional one-line lead. Product cards are image
first (square), name (two lines max), price with the struck comparison beside
it and "% off" in brand-ink - never a bigger invented number.

### Inputs & Forms

Label above, field, hint below - always in that order (Baymard). Fields are
`h-10`. The category picker is a combobox: type a word, pick from matches
grouped under the parent. Rich text for descriptions with four buttons (bold,
italic, bullets, numbers) and everything scrubbed to the nine tags the server
accepts. A sticky save bar at the bottom of long forms.

### Navigation

Storefront: a frosted 56px header with the mark, the search field visible (not
behind an icon - Baymard is explicit), Shop, Cart, account, theme; a category
strip beneath it on wide screens, a drawer on phones. Panels: their own 56px
bar (mark · panel badge · View shop · account · theme) and a grouped sidebar
(Selling / Money / Records / AI) that becomes a drawer below `lg`. The active
item is a violet-tinted fill with brand-ink text.

### Pills, Tags, and Chips

Filter chips on the shop are removable pills. Action chips in the AI Studio
(White background / Show it in use / Describe it) are outlined pills; the
selected one takes the violet-tinted fill. Style chips are small solid pills.
Quality bands are tiny rounded labels: Best / High / Good / Basic.

### Signature Components

- **The mark**: a jharokha, rendered (gpt-image-2, then cropped to the squircle
  at 512/192/64/32), with a hand-drawn SVG silhouette as the flat version for
  invoices and labels.
- **The product mosaic**: six live product photos, three columns, the middle
  column offset by half a tile so it reads as a collage - on the home hero and
  the sign-in panel.
- **The model chip**: the AI model selector inside the prompt bar, every model
  with what is left today, spent ones disabled with the reason and the return
  time. Nothing about what is doing the work is hidden.
- **Skeletons that wait 300ms**: every loading state is invisible for 300ms and
  mirrors the real layout, so a fast page shows no skeleton at all.

## Motion

Purposeful and short: 200ms ease on hover shadows, 100ms on menus, the
skeleton's 200ms fade after its 300ms hold. Two slow drifting blooms on the
home hero (18s / 26s), stopped entirely under `prefers-reduced-motion`. No
scroll-jacking, no parallax, no entrance animations on content - most visitors
are on a 4G phone and the product is the show.

## Do's and Don'ts

### Do

- Let the product photograph be the loudest thing on the page.
- Use violet to mean "this is the action"; use the gradient only on the mark
  and brand moments.
- Put the label above the field and the hint below it, every time.
- Say what actually happened, and what works next.
- Show the AI's provenance on every result: model, provider, quality.
- Ask before spending; undo after removing.
- Verify in the browser at 390px and 1440px, in both themes, before calling it
  done.

### Don't

- Name a category in the frame - no "jewellery" in the header, the hero, the
  footer or the mark.
- Reveal which seller the platform owns or that any shop pays a different
  commission.
- Put glass on a dense list, or blur above 20px.
- Use marigold, orange or any warm hue as a UI colour; warm belongs to the
  goods and to the one pink accent.
- Put the storefront's header, category strip or footer on a seller or admin
  page.
- Add a second typeface, a decorative gradient, or an entrance animation.
- Invent a "was" price. The comparison is the MRP or the pre-sale price, never
  a bigger number.
- Ship anything that was not first checked against a reference. If the
  research turns up a requirement we do not have, build it - backend included.
