import Image from 'next/image';

/**
 * The ShopMaster Pro mark.
 *
 * WHAT IT IS
 *   A shopping bag with a shop front inside it: a scalloped awning across the
 *   bag and two shutters below it, white on a magenta tile that runs #C21A8D
 *   into #78095A and is lit from the top-left.
 *
 * WHY NOT A BAG ON ITS OWN
 *   Because a bag on its own is taken. Shopify's mark is a bag with an S cut
 *   into it and Flipkart's is a bag with an f in it - the two closest
 *   references in the business, both using the same construction. The shop
 *   front inside the bag is the part that is ours, and it says the thing the
 *   product actually is: not one shop, MANY shops, in one place.
 *
 * WHY THE JHAROKHA WENT (26 Sep 2026)
 *   It was the honest Jaipur form - secular, domestic, the thing Hawa Mahal is
 *   five storeys of - and it was still a building, and a marketplace is not a
 *   building. At 16px an arch over a ledge reads as a generic window rather
 *   than as commerce. Jaipur stays in the identity through the COLOUR, which
 *   is where it was always doing the work: the city was painted terracotta in
 *   1876 to welcome a visitor, and that is why the world calls it the Pink
 *   City. That pink is now the whole tile instead of a light inside an arch.
 *
 * HOW IT WAS MADE
 *   Rendered in 3D by FLUX.2 klein-9b on Cloudflare (26 Sep 2026), then
 *   recoloured onto the brand tokens hue by hue - each pixel keeps its own
 *   LIGHTNESS, which is what the 3D actually is, so the render's shading and
 *   its shadow survive a change of palette. The ground is found by flooding in
 *   from the middle of each edge of the original render, where the tile and
 *   the awning are sixty degrees apart on the wheel; do it after the recolour
 *   and they are one degree apart, the flood walks in through the ends of the
 *   awning and eats the shop front.
 *
 *   Finished with the four things an app icon is built from: a specular sheen,
 *   a rim light (bright along the top edge, dark along the bottom - this is
 *   what makes a tile look like an object), a bloom from the light source, and
 *   a vignette into the far corner.
 *
 * WHY IT IS A PNG AND THE FLAT ONE IS NOT
 *   Apple's guidance now says to ship flat layered art and let the system add
 *   depth; that is right for iOS 26 and wrong for us, because the Play Store
 *   icon is a flat 512x512 raster with no system depth and most of this shop's
 *   buyers are on Android. So the tile is a render, and LogoMark below is the
 *   drawn one-colour twin for invoices, courier labels and anywhere a
 *   photograph cannot go - same bag, same awning, same proportions.
 *
 * WHY THE PARCEL WENT, BEFORE ANY OF THIS
 *   It was category-neutral, which was right, and anonymous, which was not.
 *   Every logistics company on earth has a box in its logo.
 */

/** The bag itself: straight sides, because a taper reads as a basket. */
const BAG = 'M16 24.5h32v23.6a4.4 4.4 0 0 1-4.4 4.4H20.4a4.4 4.4 0 0 1-4.4-4.4Z';

/** The handle, as a stroke rather than a filled ring, so it holds at 16px. */
const HANDLE = 'M25 24.5v-3a7 7 0 0 1 14 0v3';

/**
 * The awning: a band across the bag with four scallops cut from its lower
 * edge. The scallops are the whole signal - a plain rectangle there reads as a
 * label stuck on a bag, and the shop front disappears.
 */
const AWNING =
  'M17.6 26.5h28.8v4.6a3.6 3.6 0 0 1-7.2 0 3.6 3.6 0 0 1-7.2 0 3.6 3.6 0 0 1-7.2 0 3.6 3.6 0 0 1-7.2 0Z';

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
      <path d={HANDLE} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      {/*
        In one colour the bag has to be an OUTLINE and the awning the only
        solid: fill them both and the shop front vanishes into the bag, which
        is the one thing the mark is for.
      */}
      <path d={BAG} fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" />
      <path d={AWNING} fill="currentColor" />
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
    // A little tighter and a little smaller on a phone (24 Sep 2026): at 360px
    // the header's three groups wanted more room than the row had, and the
    // name is not worth a page that scrolls sideways.
    <span className={`inline-flex items-center gap-2 sm:gap-2.5 ${className}`}>
      <TileMark size={64} priority className={`h-8 w-8 shrink-0 ${markClassName}`} />
      <span className="text-[15px] font-semibold leading-none tracking-tight sm:text-[17px]">
        ShopMaster
        <span className="ml-1 font-medium text-brand-ink">Pro</span>
      </span>
    </span>
  );
}
