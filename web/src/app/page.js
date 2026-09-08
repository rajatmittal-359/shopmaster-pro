import Link from 'next/link';
import { getProducts, getCategories } from '@/lib/api';
import { serialiseJsonLd } from '@/lib/jsonLd';
import { POLICY, BUSINESS } from '@/config/policy';
import Hero from '@/components/home/Hero';
import ProductCard from '@/components/product/ProductCard';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';

export const metadata = {
  alternates: { canonical: '/' },
};

/**
 * The Organization record for the whole site.
 *
 * It lives here and nowhere else - one page, one description of who we are, so
 * there is nothing to contradict. Since 2026 Google also reads the return and
 * shipping policies at the Organization level, which is why they are repeated
 * from config/policy.js rather than written out: the same numbers the policy
 * pages and the product offers use.
 */
const organisation = {
  '@context': 'https://schema.org',
  '@type': 'OnlineStore',
  name: BUSINESS.tradeName,
  legalName: BUSINESS.legalName,
  url: SITE,
  email: BUSINESS.email,
  telephone: BUSINESS.phone,
  address: {
    '@type': 'PostalAddress',
    streetAddress: BUSINESS.addressLines[0],
    addressLocality: 'Jaipur',
    addressRegion: 'Rajasthan',
    postalCode: '302019',
    addressCountry: 'IN',
  },
  hasMerchantReturnPolicy: {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'IN',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: POLICY.returnDays,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/ReturnShippingFees',
  },
};

export default async function Home() {
  const [newest, categories] = await Promise.all([
    getProducts({ limit: 8, sort: 'newest' }),
    getCategories(),
  ]);

  const products = newest?.products || [];
  // Only categories that actually have something in them. A tile leading to an
  // empty grid is worse than one tile fewer.
  const shown = categories.filter((c) => c.productCount > 0).slice(0, 8);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(organisation) }}
      />

      <Hero />

      {shown.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="text-lg font-semibold">Browse by category</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {shown.map((cat) => (
              <Link
                key={cat._id}
                href={`/shop?category=${cat.slug}`}
                className="glow-hover rounded-xl border border-border p-4 hover:border-primary hover:bg-accent"
              >
                <p className="font-medium">{cat.name}</p>
                <p className="text-sm text-muted-foreground">
                  {cat.productCount} {cat.productCount === 1 ? 'item' : 'items'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {products.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Just added</h2>
            <Link href="/shop" className="text-sm text-brand-ink hover:underline">
              See everything
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        </section>
      )}

      {/*
        The shop behind the site, with the real address.
        Two reasons beyond telling the story: Razorpay's website check and
        Merchant Center both want a verifiable business, and a Jaipur address in
        readable text is what ties this site to the Google Business Profile that
        already ranks for the family shop.
      */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">The shop behind it</h2>
            <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
              ShopMaster Pro is run from Devi Nagar, Jaipur by{' '}
              {BUSINESS.legalName}. Independent sellers list here across every
              category, and every product page names the seller it comes from.
            </p>
            <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
              You can walk into the shop. That is the point of putting the
              address here rather than a form.
            </p>
          </div>

          <div className="text-[15px] leading-7">
            <address className="not-italic text-muted-foreground">
              <strong className="text-foreground">{BUSINESS.legalName}</strong>
              <br />
              {BUSINESS.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block">{BUSINESS.landmark}</span>
            </address>
            <p className="mt-3">
              <a href={BUSINESS.phoneHref} className="text-brand-ink hover:underline">
                {BUSINESS.phone}
              </a>
              <span className="block text-muted-foreground">{BUSINESS.hours}</span>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
