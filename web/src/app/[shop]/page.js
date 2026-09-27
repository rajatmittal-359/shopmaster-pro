import { notFound } from 'next/navigation';
import ShopView, { shopMetadata } from '@/components/shop/ShopView';

/**
 * www.shopmasterpro.in/charming-jewels - a shop's short link (27 Sep 2026).
 *
 * WHY IT IS AT THE ROOT
 *   This link goes into a WhatsApp Business profile, a Google Business
 *   Profile, an Instagram bio and onto parcel slips. `/sellers/6a93cf88...`
 *   does none of those jobs: nobody reads it, nobody types it, and it makes
 *   a family shop look like a database row.
 *
 * WHY THIS IS SAFE
 *   Next gives a static route priority over a dynamic one, so /cart, /help
 *   and every real page still win - this only ever sees paths nothing else
 *   claimed. The danger is the other way round: a shop minting the slug
 *   "cart" would save a link that silently goes somewhere else. That is
 *   prevented where slugs are made (backend utils/sellerSlug), not here.
 *
 *   The shape is checked before the database is asked, so the catch-all
 *   cannot be turned into a lookup generator by walking random URLs.
 */
const SHAPE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export async function generateMetadata({ params }) {
  const { shop } = await params;
  if (!SHAPE.test(shop)) return { title: 'Not found' };
  return shopMetadata(shop);
}

export default async function ShopByHandle({ params }) {
  const { shop } = await params;
  // Not a slug at all - a typo, a probe, an old URL. The ordinary 404.
  if (!SHAPE.test(shop)) notFound();
  return <ShopView handle={shop} />;
}
