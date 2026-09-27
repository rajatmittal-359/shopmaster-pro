import ShopView, { shopMetadata } from '@/components/shop/ShopView';

/**
 * The shop by its user id. Kept forever: it is the URL a product page links
 * to, the one Google has already indexed, and the one pasted into profiles
 * before short links existed. The view sets the canonical to the short link,
 * so this address keeps working without competing with it.
 */
export async function generateMetadata({ params }) {
  const { id } = await params;
  return shopMetadata(id);
}

export default async function SellerPage({ params }) {
  const { id } = await params;
  return <ShopView handle={id} />;
}
