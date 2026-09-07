/**
 * The ShopMaster Pro mark.
 *
 * WHAT IT IS
 *   A cut stone, drawn as a table (the flat top face) over a pavilion (the
 *   facets that come to a point). It is the shape every shopper already reads
 *   as "jewellery" before they read a single word, and it is four straight
 *   lines and two triangles - which is the only way a mark survives being
 *   printed on a courier label at 20px.
 *
 * WHY IT IS NOT A SHOPPING BAG OR A CART
 *   Every marketplace uses one. The mark has to say which shop this is, and a
 *   bag says only "a shop". The stone says what is in the bag.
 *
 * WHY IT IS DRAWN AND NOT A FILE
 *   currentColor. The header wants it in the brand colour, the invoice wants it
 *   in black, a dark footer wants it in white, and the favicon wants it solid.
 *   A PNG needs four files that drift; this needs none. It also has no
 *   fixed size, so it is sharp on a phone and on a printed Bill of Supply.
 *
 * SIZING
 *   The viewBox is square and the shape is centred, so it drops into a circular
 *   avatar or a square favicon without cropping.
 */

/** The stone alone. Use where the name is already on screen. */
export function LogoMark({ className = '', ...props }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="ShopMaster Pro"
      className={className}
      {...props}
    >
      {/*
       * The table - the flat top. Drawn as its own shape rather than as part of
       * the outline so it can carry a lighter fill and read as a facet catching
       * light, which is the whole difference between "a gem" and "a triangle".
       */}
      <path
        d="M8 11.5 L11 7 L21 7 L24 11.5 Z"
        fill="currentColor"
        fillOpacity="0.45"
      />

      {/* The pavilion - everything below the girdle, meeting at the culet. */}
      <path d="M8 11.5 L24 11.5 L16 25 Z" fill="currentColor" />

      {/*
       * Two facet lines. Without them the pavilion is a plain triangle; with
       * them it is cut stone. They are strokes rather than shapes so they stay
       * hairline-thin as the mark scales down.
       */}
      <path
        d="M11 7 L13.2 11.5 M21 7 L18.8 11.5"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Mark plus name, for the header and the footer.
 *
 * "ShopMaster" carries the weight and "Pro" is set lighter beside it, so the
 * eye lands on the part that is actually the name. Set in the same stack as
 * the rest of the page rather than a display face - a wordmark that needs a
 * webfont is a wordmark that flashes on a slow connection, and most of this
 * shop's visitors are on 4G.
 */
export default function Logo({ className = '', markClassName = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={`h-7 w-7 shrink-0 ${markClassName}`} />
      <span className="text-lg font-semibold tracking-tight">
        ShopMaster<span className="font-normal opacity-70"> Pro</span>
      </span>
    </span>
  );
}
