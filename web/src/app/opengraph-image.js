import { ImageResponse } from 'next/og';
import { GRADIENT, OG_SIZE, markDataUrl } from '@/lib/ogCard';

/**
 * The default share card (19 Sep 2026).
 *
 * WHY
 *   A link forwarded on WhatsApp is judged by its card. Product pages already
 *   carry the product photo; the home page, /shop, the policies and every
 *   page without a photo of its own showed a bare grey link. Next merges this
 *   file into every route below it that does not set openGraph.images, so
 *   one file covers them all (Flipkart and Meesho do the same: one brand
 *   card for anything that is not a product).
 *
 *   Brand gradient from DESIGN.md (Jaipur pink → royal violet → royal blue),
 *   the jharokha mark, the name, the one-line promise. No category word: the
 *   frame sells variety. 1200×630 is the size WhatsApp, Facebook, LinkedIn
 *   and Slack all read at full width.
 */
export const alt = 'ShopMaster Pro - a marketplace from Jaipur, delivered across India';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image() {
  const mark = await markDataUrl();
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', background: GRADIENT, color: 'white', padding: 80, fontFamily: 'sans-serif' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain img */}
        <img src={mark} alt="" width={220} height={220} style={{ borderRadius: 48, boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 64 }}>
          <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>ShopMaster Pro</div>
          {/* satori: any element with two children must say display:flex - so two lines, two divs. */}
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 40, marginTop: 28, opacity: 0.92, lineHeight: 1.25 }}>
            <div>A marketplace from Jaipur,</div>
            <div>delivered across India.</div>
          </div>
          <div style={{ fontSize: 28, marginTop: 36, opacity: 0.75 }}>shopmasterpro.in</div>
        </div>
      </div>
    ),
    size,
  );
}
