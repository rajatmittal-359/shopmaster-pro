# ShopMaster Pro — frontend rules (read by the `/frontend` skill)

## Goals the gate checks against
1. **Liquidity** — buyers finding more of what the sellers we have actually stock.
2. **Trust** — a stranger in Jaipur or Jhansi believing the shop *and* the seller: reviews, verified purchase, honest status, honest money.
3. **Seller recruitment** — the next Jaipur shop choosing to list here and running its business from the panel.
4. **October 2026 cutover** — nothing the React app (`frontend/`) could do may be missing from `web/`. `WHAT-IS-LEFT.md` §1 is that list.

Stage: three sellers, ~50 products, single-digit orders a day. Not Amazon.

## Non-negotiables
- `web/DESIGN.md` — tokens and do's/don'ts. Cool violet frame, one warm accent (Jaipur pink) on brand moments only; no category named in the frame; never reveal which seller the platform owns; glass never on a dense list; one typeface (Geist).
- `FRONTEND-PLAN.md` §2a — the reference map (who to copy for what, who not to). §4.x — each page's history. §14.4 — panel rules: server decides, panel draws; money per seller; confirm what spends money; undo the rest.
- Browser verification **only on Rajat's laptop, locally** (Playwright MCP against localhost). The Chrome extension is banned. Never log in for him.
- No `npm install` from Claude; commit at milestones.

## Where things are
- Storefront: `web/src/app/*`, components under `web/src/components/{home,shop,product,cart,checkout,orders,account}`.
- Seller panel: `/seller/*` — Home · Orders · Products (tabs: all / studio / stock) · Payments · Settings; `components/seller/*`, `ProductsNav`; admin: `/admin/*`, `components/admin/*`; shared panel chrome `components/panel/*` (`PanelShell`, `PageHeader`, `PanelCard`).
- AI tools: `components/ai/*` (Studio, ModelChip, AttachToProduct), `components/seller/MediaManager`.
- Confirmations: `components/common/ActionDialog` (named reasons + optional details); toasts via sonner for undo.

## Record after building
Dated paragraph in `FRONTEND-PLAN.md` §4 (reference named, decision, reason); row removed/added in `WHAT-IS-LEFT.md`.
