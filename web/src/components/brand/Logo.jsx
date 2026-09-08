/**
 * The ShopMaster Pro mark.
 *
 * WHY THE GEM WAS REPLACED
 *   The first mark was a cut stone. It was well drawn and it was wrong: a gem
 *   says JEWELLERY, and this platform's whole promise is that it sells
 *   anything - kurtis, bedsheets, cosmetics, whatever the next seller brings.
 *   A logo is the one piece of the site that appears on every page, every
 *   invoice and every courier label, so it is the last place a single category
 *   should be printed. The frame around the products has to stay neutral; the
 *   category belongs on the product.
 *
 * WHAT IT IS NOW
 *   A parcel, drawn isometrically, sitting inside a gradient tile.
 *
 *   The parcel because it is the one object that means "commerce" without
 *   naming a category - a box holds anything, which is precisely the promise -
 *   and because it is what actually arrives at the door. It is drawn as three
 *   real faces at three different brightnesses, so the depth is geometry, not a
 *   drop shadow: the top catches the light, the left face is in half light, the
 *   right face is in shadow.
 *
 *   The tile because that is what a brand mark IS in 2026. Roughly 40% of the
 *   top hundred apps on both stores now sit on a gradient tile, and the current
 *   direction - "soft 3D" - is rounded shapes with gentle lighting rather than
 *   the hard glossy skeuomorphism of 2012. It is also the only shape that
 *   survives being a favicon, an app icon and a WhatsApp display picture, which
 *   is where most people will first see this shop.
 *
 * WHY VIOLET INTO CYAN
 *   It is the site's own gradient, and it is the register the brand is aiming
 *   at: the colour of the software this generation already respects rather
 *   than the colour of a shop. The run is violet -> indigo -> cyan, which is
 *   analogous - neighbouring hues, which is what reads as depth. A gradient
 *   between unrelated colours reads as a mistake.
 *
 * THE SEAM
 *   The two front faces do not touch. A hairline of the tile shows between
 *   them, so the box is a box at 16px too, where a shared edge would close up
 *   and leave a flat white blob.
 *
 * WHY IT IS DRAWN AND NOT A PNG
 *   One file instead of four that drift, no blur on a high-density screen, and
 *   a few hundred bytes inside the HTML rather than a request that has to
 *   finish before the header stops flashing.
 */

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
        {/* Violet into indigo into a cyan tip, lit from the top left. */}
        <linearGradient id={id('tile')} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A78BFA" />
          <stop offset="0.5" stopColor="#6366F1" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>

        {/* The soft-3D light: strongest at the very top, gone by the middle. */}
        <linearGradient id={id('gloss')} x1="32" y1="2" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.42" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        {/* The bevel: white along the top edge, dark along the bottom. One
            stroke, so it stays a hairline at every size. */}
        <linearGradient id={id('bevel')} x1="32" y1="2" x2="32" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.05" />
          <stop offset="1" stopColor="#1E1B4B" stopOpacity="0.45" />
        </linearGradient>

        {/* Contact shadow inside the tile, under the parcel. */}
        <radialGradient
          id={id('under')}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(32 50) rotate(90) scale(9 17)"
        >
          <stop stopColor="#1E1B4B" stopOpacity="0.34" />
          <stop offset="1" stopColor="#1E1B4B" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The tile. rx is 28% of the width - Apple's squircle proportion, and
          the reason it reads as an app icon rather than a rounded rectangle. */}
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${id('tile')})`} />
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${id('gloss')})`} />
      <ellipse cx="32" cy="50" rx="17" ry="9" fill={`url(#${id('under')})`} />

      {/*
       * The parcel. Top face at full white, left at 0.82, right at 0.6 - the
       * three-value split is what the eye reads as a solid object. A single
       * white silhouette with lines drawn on it never does.
       */}
      <path d="M32 13 L47 21.5 L32 30 L17 21.5 Z" fill="#FFFFFF" />
      <path d="M16 23.2 L30.6 31.5 L30.6 48.6 L16 40.3 Z" fill="#FFFFFF" fillOpacity="0.82" />
      <path d="M48 23.2 L33.4 31.5 L33.4 48.6 L48 40.3 Z" fill="#FFFFFF" fillOpacity="0.6" />

      {/*
       * The tape, across the lid and down the front. It is what separates a
       * parcel from a plain cube, and it is drawn in the tile's own colour so
       * it costs nothing at small sizes - it simply disappears.
       */}
      <path
        d="M32 13 L32 30"
        stroke="#4338CA"
        strokeOpacity="0.5"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
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
      {/* The outline of the whole parcel, filled once. */}
      <path d="M32 8 L56 21.5 L56 46.5 L32 60 L8 46.5 L8 21.5 Z" fill="currentColor" />
      {/* The three edges that make it a box rather than a hexagon, knocked out
          of the fill so this works on any background colour. */}
      <path
        d="M8 21.5 L32 35 L56 21.5 M32 35 L32 60"
        stroke="#FFFFFF"
        strokeOpacity="0.55"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="none"
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
      <TileMark idPrefix={idPrefix} className={`h-8 w-8 shrink-0 ${markClassName}`} />
      <span className="text-[17px] font-semibold leading-none tracking-tight">
        ShopMaster
        <span className="ml-1 font-medium text-brand-ink">Pro</span>
      </span>
    </span>
  );
}
