import Image from 'next/image';

/**
 * The ShopMaster Pro mark.
 *
 * WHAT IT IS
 *   A jharokha - the arched window that overhangs the front of almost every old
 *   building in Jaipur, and the thing Hawa Mahal is made of, five storeys of
 *   them - carved sandstone, lit pink from inside, on a tile that runs the
 *   brand gradient: Jaipur pink into royal violet into royal blue.
 *
 * HOW IT WAS MADE
 *   Rendered by gpt-image-2 through Pollinations on 11 Sep 2026, from a prompt
 *   written for a MARK - no text, dark ground, legible at 32px, palette by hex.
 *   Six drafts, two concepts each; this was `jharokha-2`. The prompt and the
 *   export pipeline live in scripts/brand/, so it can be regenerated or
 *   re-exported at any size without anyone redrawing it.
 *
 *   The hand-drawn SVG jharokha below (LogoMark) is kept as the FLAT version -
 *   one colour, for invoices, courier labels and anywhere a photograph cannot
 *   go. Same window, same proportions, so the two read as one brand.
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
 * The rendered tile, as a picture.
 *
 * `next/image` with fixed dimensions so the header never shifts while it loads,
 * and `priority` because it is in the first paint of every page. The 512px
 * master is served resized by Next, so a 32px header costs a 32px file.
 *
 * `idPrefix` is accepted and ignored: callers from the SVG era still pass it,
 * and a picture has no gradient ids to collide.
 */
export function TileMark({ className = '', size = 32, priority = false, ...props }) {
  const { idPrefix: _ignored, ...rest } = props;
  return (
    <Image
      src="/brand/mark-512.png"
      alt="ShopMaster Pro"
      width={size}
      height={size}
      priority={priority}
      className={className}
      {...rest}
    />
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
export default function Logo({ className = '', markClassName = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <TileMark size={64} priority className={`h-8 w-8 shrink-0 ${markClassName}`} />
      <span className="text-[17px] font-semibold leading-none tracking-tight">
        ShopMaster
        <span className="ml-1 font-medium text-brand-ink">Pro</span>
      </span>
    </span>
  );
}
