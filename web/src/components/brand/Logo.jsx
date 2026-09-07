/**
 * The ShopMaster Pro mark.
 *
 * WHAT IT IS
 *   A brilliant-cut stone seen from the front: a table, two crown facets and
 *   three pavilion facets meeting at the culet. Six flat planes, each lit
 *   differently - which is the whole trick. A gem does not read as a gem
 *   because of its outline; it reads as one because neighbouring faces catch
 *   different amounts of light. So the depth here is real geometry, not a drop
 *   shadow stuck under a triangle.
 *
 * WHY IT IS NOT A SHOPPING BAG OR A CART
 *   Every marketplace uses one. The mark has to say WHICH shop this is, and a
 *   bag says only "a shop". The stone says what is in the bag.
 *
 * WHY THERE ARE TWO OF THEM
 *   `GemMark` is the faceted one, for the screen. `LogoMark` is the same shape
 *   flattened to a single `currentColor` silhouette, for everywhere a gradient
 *   cannot go or should not: a black-and-white invoice, a courier label, a
 *   favicon at 16px where six facets turn to mud, and any dark surface where
 *   the mark must simply take the colour of the text beside it.
 *
 * WHY IT IS DRAWN AND NOT A PNG
 *   One file instead of four that drift, no asset to lose, no blur on a
 *   high-density phone screen, and it is a few hundred bytes inside the HTML
 *   rather than a request that has to finish before the header stops flashing.
 */

/**
 * `idPrefix` exists because SVG gradients are referenced by id, and ids are
 * global to the document. Two marks on one page (header and footer) would
 * otherwise declare the same ids twice. They are identical, so nothing breaks
 * visually - but it is invalid HTML, and the day someone gives one of them a
 * different palette it would break silently. Pass a prefix for the second one.
 */
export function GemMark({ className = '', idPrefix = 'smp', ...props }) {
  const id = (name) => `${idPrefix}-${name}`;

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="ShopMaster Pro"
      className={className}
      {...props}
    >
      <defs>
        {/* Crown - lit from the upper left, so the table is brightest. */}
        <linearGradient id={id('table')} x1="24" y1="8" x2="40" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF0CB" />
          <stop offset="1" stopColor="#FBCE6D" />
        </linearGradient>
        <linearGradient id={id('crownL')} x1="6" y1="8" x2="24" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8D588" />
          <stop offset="1" stopColor="#E2A733" />
        </linearGradient>
        <linearGradient id={id('crownR')} x1="40" y1="8" x2="58" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EFB44A" />
          <stop offset="1" stopColor="#C9821B" />
        </linearGradient>

        {/* Pavilion - deeper, because it is the part in shadow under the stone. */}
        <linearGradient id={id('pavL')} x1="6" y1="26" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#D69A2C" />
          <stop offset="1" stopColor="#A05E11" />
        </linearGradient>
        <linearGradient id={id('pavC')} x1="20" y1="26" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F4BE55" />
          <stop offset="1" stopColor="#C07B18" />
        </linearGradient>
        <linearGradient id={id('pavR')} x1="58" y1="26" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B87A1D" />
          <stop offset="1" stopColor="#824C09" />
        </linearGradient>
      </defs>

      {/* Crown: table between two shoulder facets. */}
      <path d="M24 8 H40 L44 26 H20 Z" fill={`url(#${id('table')})`} />
      <path d="M16 8 H24 L20 26 H6 Z" fill={`url(#${id('crownL')})`} />
      <path d="M40 8 H48 L58 26 H44 Z" fill={`url(#${id('crownR')})`} />

      {/* Pavilion: three facets running to the culet at (32,58). */}
      <path d="M6 26 H20 L32 58 Z" fill={`url(#${id('pavL')})`} />
      <path d="M20 26 H44 L32 58 Z" fill={`url(#${id('pavC')})`} />
      <path d="M44 26 H58 L32 58 Z" fill={`url(#${id('pavR')})`} />

      {/*
       * The girdle. A hairline of white along the widest line of the stone is
       * what real jewellery photography shows, and without it the crown and the
       * pavilion read as two shapes that happen to touch.
       */}
      <path d="M6 26 H58" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.25" />

      {/*
       * One specular highlight, top-left, at low opacity. More than one and it
       * stops looking cut and starts looking plastic.
       */}
      <path d="M25 10 H31 L28.5 24 H22.5 Z" fill="#FFFFFF" fillOpacity="0.35" />
    </svg>
  );
}

/**
 * The flat silhouette: one colour, no gradients, no ids.
 *
 * Same outline as the faceted mark, with the facet lines kept as strokes so it
 * still reads as a cut stone rather than a plain kite.
 */
export function LogoMark({ className = '', ...props }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="ShopMaster Pro"
      className={className}
      {...props}
    >
      <path d="M16 8 H48 L58 26 L32 58 L6 26 Z" fill="currentColor" />
      <path
        d="M6 26 H58 M24 8 L20 26 M40 8 L44 26 M20 26 L32 58 M44 26 L32 58"
        stroke="#FFFFFF"
        strokeOpacity="0.45"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Mark plus name, for the header and the footer.
 *
 * "ShopMaster" carries the weight and "Pro" is set lighter beside it, so the
 * eye lands on the part that is actually the name. Set in the page's own font
 * stack rather than a display face: a wordmark that waits on a webfont is a
 * wordmark that flashes on a slow connection, and most of this shop's visitors
 * are on 4G.
 */
export default function Logo({ className = '', markClassName = '', idPrefix = 'smp' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <GemMark idPrefix={idPrefix} className={`h-7 w-7 shrink-0 ${markClassName}`} />
      <span className="text-[17px] font-semibold leading-none tracking-tight">
        ShopMaster
        <span className="ml-1 font-medium text-brand-ink">Pro</span>
      </span>
    </span>
  );
}
