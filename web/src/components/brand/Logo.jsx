/**
 * The ShopMaster Pro mark.
 *
 * WHAT IT IS
 *   A jharokha - the arched window that overhangs the front of almost every old
 *   building in Jaipur, and the thing Hawa Mahal is made of, five storeys of
 *   them - lit from inside, on a deep violet tile.
 *
 * WHY A JHAROKHA
 *   The brief was to connect the mark to Jaipur and to India without it looking
 *   borrowed or fake. Three reasons this is the honest way to do that:
 *
 *   1. It is genuinely his city's own form. Jharokhas are what give Jaipur its
 *      facades. They are secular, domestic architecture - not a monument
 *      borrowed for decoration, and not a national symbol pressed into a logo.
 *   2. It MEANS the right thing. A jharokha is a window you look out of and
 *      others look into, and this is a marketplace: a window onto everything
 *      other people are selling. A doorway is the oldest sign a shop has.
 *   3. It survives being small. An arch and a ledge are two shapes. At 16px
 *      that still reads as a window; a skyline or a palace turns to mud.
 *
 * WHY THE OPENING IS PINK
 *   Jaipur was painted terracotta in 1876, on one man's order, to welcome a
 *   visitor - and that single decision is why the world calls it the Pink City.
 *   It is one of the most successful pieces of city branding ever done, and it
 *   is the correct colour to put inside a Jaipur window. Against deep violet it
 *   also does the job the palette needs: a warm light inside a cool frame,
 *   which is what makes the arch read as LIT rather than as a hole.
 *
 * WHY THE PARCEL WENT
 *   It was category-neutral, which was right, and anonymous, which was not.
 *   Every logistics company on earth has a box in its logo. This one could not
 *   belong to anybody else.
 *
 * WHY IT IS DRAWN AND NOT A PNG
 *   One file instead of four that drift, no blur on a high-density screen, and
 *   a few hundred bytes inside the HTML rather than a request that has to
 *   finish before the header stops flashing.
 */

/**
 * The arch, as one path, shared by both marks.
 *
 * Two quadratic curves meeting at a POINT rather than a dome - which is what
 * separates a Rajput-Mughal arch from a Roman one, and it is the whole
 * difference between "Jaipur" and "generic archway".
 */
const ARCH = 'M15 50 L15 29 Q15 15 32 9 Q49 15 49 29 L49 50 Z';

/**
 * The ledge the window sits on. Wider than the arch, because a jharokha
 * PROJECTS from the wall - that overhang is the entire point of one.
 */
const LEDGE = 'M11 50 H53 A1.9 1.9 0 0 1 53 53.8 H11 A1.9 1.9 0 0 1 11 50 Z';

/**
 * `idPrefix` exists because SVG gradients are referenced by id, and ids are
 * global to the document. Two marks on one page would otherwise declare the
 * same ids twice. Pass a prefix for the second one.
 */
export function TileMark({ className = '', idPrefix = 'smp', ...props }) {
  const id = (name) => `${idPrefix}-${name}`;

  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="ShopMaster Pro" className={className} {...props}>
      <defs>
        {/* The tile: deep violet into indigo. Dark on purpose - a pale tile
            leaves the pink nothing to glow against. */}
        <linearGradient id={id('tile')} x1="6" y1="2" x2="58" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B21B6" />
          <stop offset="0.55" stopColor="#3B1F87" />
          <stop offset="1" stopColor="#221459" />
        </linearGradient>

        {/* One soft light in the top-left corner. It is what stops a flat
            rectangle from looking like a flat rectangle. */}
        <radialGradient
          id={id('sheen')}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(16 8) rotate(52) scale(46)"
        >
          <stop stopColor="#C4B5FD" stopOpacity="0.45" />
          <stop offset="1" stopColor="#C4B5FD" stopOpacity="0" />
        </radialGradient>

        {/* The lit opening: Jaipur pink falling to terracotta, brightest at the
            top where the light would come from. */}
        <linearGradient
          id={id('glow')}
          x1="32"
          y1="10"
          x2="32"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFE4EE" />
          <stop offset="0.45" stopColor="#F9A8C8" />
          <stop offset="1" stopColor="#E8734F" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${id('tile')})`} />
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${id('sheen')})`} />

      {/*
       * The frame: the same arch, very slightly larger, behind the lit one.
       * That hairline is what makes the opening read as SET INTO the wall
       * rather than painted onto it.
       */}
      <path
        d={ARCH}
        transform="translate(32 31) scale(1.09) translate(-32 -31)"
        fill="#EDE9FE"
        fillOpacity="0.2"
      />
      <path d={ARCH} fill={`url(#${id('glow')})`} />

      {/*
       * Two mullions. A jharokha is a SCREEN, not a hole - the verticals are
       * what stop this reading as a plain arch. Drawn in the tile's own colour
       * so that at favicon size they close up and vanish rather than turning
       * into noise.
       */}
      <path
        d="M26.5 50 V20.5 M37.5 50 V20.5"
        stroke="#3B1F87"
        strokeOpacity="0.42"
        strokeWidth="1.7"
        strokeLinecap="round"
      />

      <path d={LEDGE} fill="#F5F3FF" fillOpacity="0.95" />
    </svg>
  );
}

/**
 * The flat silhouette: one colour, no gradients, no ids.
 *
 * For everywhere a gradient cannot go or should not - a black-and-white
 * invoice, a courier label, a dark surface where the mark should simply take
 * the colour of the text beside it.
 */
export function LogoMark({ className = '', ...props }) {
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label="ShopMaster Pro" className={className} {...props}>
      <path d={ARCH} fill="currentColor" />
      <path d={LEDGE} fill="currentColor" />
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
      <TileMark idPrefix={idPrefix} className={`h-8 w-8 shrink-0 ${markClassName}`} />
      <span className="text-[17px] font-semibold leading-none tracking-tight">
        ShopMaster
        <span className="ml-1 font-medium text-brand-ink">Pro</span>
      </span>
    </span>
  );
}
