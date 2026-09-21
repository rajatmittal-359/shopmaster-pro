import Link from 'next/link';
import Image from 'next/image';
import { getProducts, getProduct, getCategories, getSeller } from '@/lib/api';
import ProductCard from '@/components/product/ProductCard';

/**
 * The home page below the hero, as the admin arranged it (Option A S1,
 * 21 Sep 2026). `sections` comes from /public/settings already normalised
 * (backend/utils/homeSections is the contract); each type draws itself from
 * the catalogue, and a section with nothing to show draws nothing - Etsy and
 * Shopify both drop an empty module rather than show a hole.
 *
 * Server component: every fetch is the API's cached read; a home with six
 * sections is still one render pass.
 */
const isLive = (s, now = Date.now()) => !s.until || new Date(s.until).getTime() + 86400000 > now;

const Row = ({ title, href, hrefLabel, children }) => (
  <section className="mx-auto max-w-5xl px-4 py-8">
    <div className="flex items-baseline justify-between">
      <h2 className="font-display text-xl sm:text-2xl">{title}</h2>
      {href && (
        <Link href={href} className="text-sm text-brand-ink hover:underline">
          {hrefLabel || 'See all'}
        </Link>
      )}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{children}</div>
  </section>
);

async function Categories({ section }) {
  const all = await getCategories();
  const withStock = all.filter((c) => c.productCount > 0);
  // Admin-picked slugs in their order (empty ones still hidden), else the eight fullest.
  const shown = section.slugs?.length
    ? section.slugs.map((slug) => withStock.find((c) => c.slug === slug)).filter(Boolean)
    : withStock.slice(0, 8);
  if (!shown.length) return null;
  // One photograph per tile - the newest product in it (a name in a box is a tile nobody looks at).
  const covers = await Promise.all(shown.map(async (cat) => (await getProducts({ category: cat.slug, limit: 1, sort: 'newest' }))?.products?.[0]?.images?.[0] || null));
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h2 className="font-display text-xl sm:text-2xl">{section.title}</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((cat, i) => (
          <Link key={cat._id} href={`/shop?category=${cat.slug}`} className="glow-hover group relative block aspect-[4/5] overflow-hidden arch border border-border bg-muted">
            {covers[i] && <Image src={covers[i]} alt="" fill sizes="(max-width: 640px) 50vw, 25vw" className="object-cover transition duration-500 group-hover:scale-105" />}
            <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 via-black/30 to-transparent p-3 pt-8 text-white">
              <span className="block font-medium">{cat.name}</span>
              <span className="block text-xs opacity-80">{cat.productCount} {cat.productCount === 1 ? 'item' : 'items'}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

async function Collection({ section }) {
  if (!isLive(section)) return null;
  let products = [];
  if (section.slugs?.length) {
    // Hand-picked, in the admin's order; a slug that no longer exists is skipped.
    products = (await Promise.all(section.slugs.map((s) => getProduct(s).catch(() => null)))).filter(Boolean);
  } else {
    const params = Object.fromEntries(new URLSearchParams((section.href || '').split('?')[1] || ''));
    products = (await getProducts({ ...params, limit: 8 }).catch(() => null))?.products || [];
  }
  if (!products.length) return null;
  return (
    <Row title={section.title} href={section.href || '/shop'}>
      {products.slice(0, 8).map((p) => <ProductCard key={p._id} product={p} />)}
    </Row>
  );
}

async function Newest({ section }) {
  const res = await getProducts({ limit: 8, sort: 'newest' });
  const products = res?.products || [];
  // "Just added" only when there is enough to be a row - a lone new item is not news (Baymard: weak content in prime space).
  if (products.length < (section.min || 4)) return null;
  return (
    <Row title={section.title} href="/shop" hrefLabel="See everything">
      {products.map((p) => <ProductCard key={p._id} product={p} />)}
    </Row>
  );
}

async function Sellers({ section }) {
  if (!section.ids?.length) return null;
  const shops = (await Promise.all(section.ids.map((id) => getSeller(id).catch(() => null)))).filter((s) => s && s.seller);
  if (!shops.length) return null;
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h2 className="font-display text-xl sm:text-2xl">{section.title}</h2>
      {/* Etsy's "featured shops": the shop, where it is, three of its pieces - the row that recruits sellers as well as buyers. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shops.slice(0, 8).map(({ seller, products = [] }) => (
          <Link key={seller.id} href={`/sellers/${seller.id}`} className="glow-hover block rounded-xl border border-border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{seller.businessName}</span>
              {seller.rating?.reviews > 0 && <span className="text-xs text-muted-foreground">★ {Number(seller.rating.average).toFixed(1)} · {seller.rating.reviews}</span>}
            </div>
            {seller.city?.city && <p className="text-xs text-muted-foreground">{seller.city.city}{seller.city.state ? `, ${seller.city.state}` : ''}</p>}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {products.slice(0, 3).map((p) => (
                <span key={p._id} className="relative block aspect-square overflow-hidden rounded-md bg-muted">
                  {p.images?.[0] && <Image src={p.images[0]} alt="" fill sizes="120px" className="object-cover" />}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Banner({ section }) {
  if (!isLive(section) || !section.image) return null;
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <Link href={section.href || '/shop'} className="glow-hover relative block overflow-hidden rounded-2xl border border-border">
        <span className="relative block aspect-[16/6] sm:aspect-[16/5]">
          <Image src={section.image} alt={section.title || ''} fill sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" />
        </span>
        {(section.title || section.text) && (
          <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-4 text-white sm:p-6">
            {section.title && <span className="block text-lg font-semibold sm:text-2xl">{section.title}</span>}
            {section.text && <span className="block text-sm opacity-90">{section.text}</span>}
          </span>
        )}
      </Link>
    </section>
  );
}

const RENDER = { categories: Categories, collection: Collection, newest: Newest, sellers: Sellers, banner: Banner };

export default function Sections({ sections = [] }) {
  return sections
    .filter((s) => s.enabled && s.type !== 'hero' && RENDER[s.type])
    .map((s, i) => {
      const Draw = RENDER[s.type];
      return <Draw key={`${s.type}-${i}`} section={s} />;
    });
}
