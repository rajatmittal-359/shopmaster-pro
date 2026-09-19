import { ImageResponse } from 'next/og';
import { getSeller } from '@/lib/api';
import { GRADIENT, OG_SIZE, markDataUrl } from '@/lib/ogCard';

/**
 * A shop's own share card (19 Sep 2026).
 *
 * WHY
 *   The moment a seller forwards their shop link to a customer or a WhatsApp
 *   group is the moment ShopMaster recruits both - and a generic card there
 *   says "some website". Etsy's shop cards do this: the shop's name, its
 *   city, a strip of its first products. Built for every seller equally;
 *   nothing in it says which shop the platform's family runs.
 *
 * Falls back to the site card when the shop is not public.
 */
export const alt = 'A shop on ShopMaster Pro';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }) {
  const { id } = await params;
  const [data, mark] = await Promise.all([getSeller(id).catch(() => null), markDataUrl()]);
  const seller = data?.seller;
  // Three distinct photos - dev data has products sharing one, and a card with the same photo twice looks broken.
  const photos = [...new Set((data?.products || []).map((p) => p.images?.[0]).filter(Boolean))].slice(0, 3);
  const name = seller?.businessName || 'ShopMaster Pro';
  const line = seller
    ? [seller.city?.city, seller.productCount ? `${seller.productCount} products` : null, seller.rating ? `rated ${seller.rating.average}/5` : null].filter(Boolean).join('  ·  ')
    : 'A marketplace from Jaipur, delivered across India.';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: GRADIENT, color: 'white', padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain img */}
          <img src={mark} alt="" width={72} height={72} style={{ borderRadius: 18 }} />
          <div style={{ fontSize: 30, marginLeft: 20, opacity: 0.9 }}>ShopMaster Pro · a marketplace from Jaipur</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: photos.length ? 620 : 1000 }}>
            <div style={{ fontSize: name.length > 22 ? 60 : 80, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.05 }}>{name}</div>
            <div style={{ fontSize: 32, marginTop: 20, opacity: 0.85 }}>{line}</div>
          </div>
          {photos.length > 0 && (
            <div style={{ display: 'flex' }}>
              {photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- satori renders plain img
                <img key={src} src={src} alt="" width={150} height={150} style={{ objectFit: 'cover', borderRadius: 20, marginLeft: i ? 16 : 0, border: '3px solid rgba(255,255,255,0.7)' }} />
              ))}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
