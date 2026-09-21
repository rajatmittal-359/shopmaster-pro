import { getProducts } from '@/lib/api';
import { serialiseJsonLd } from '@/lib/jsonLd';
import { POLICY, businessFrom } from '@/config/policy';
import { getSettings } from '@/lib/api';
import Hero from '@/components/home/Hero';
import RecentlyViewed from '@/components/home/RecentlyViewed';
import Sections from '@/components/home/Sections';
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
const organisationFor = (BUSINESS) => ({
  '@context': 'https://schema.org',
  '@type': 'OnlineStore',
  name: BUSINESS.tradeName,
  legalName: BUSINESS.legalName,
  url: SITE,
  email: BUSINESS.email,
  telephone: BUSINESS.phone,
  ...(BUSINESS.sameAs.length ? { sameAs: BUSINESS.sameAs } : {}),
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
});

export default async function Home() {
  // Who we are, as the admin last saved it - the schema and the trust block read the same object.
  const settings = await getSettings();
  const business = businessFrom(settings);
  const organisation = organisationFor(business);
  const home = settings?.home || {};

  /*
   * The page below the hero is an ordered list of sections the admin arranges
   * in Settings → Home page (Option A S1, 21 Sep 2026; components/home/Sections
   * draws them, backend/utils/homeSections is the contract). The hero still
   * takes the newest pieces for its mosaic - that is a photograph, not a rule.
   */
  const newest = await getProducts({ limit: 8, sort: 'newest' });
  const products = newest?.products || [];
  // An API that predates S1 sends no list: draw the built-in layout, never a blank page.
  const sections = Array.isArray(home.sections) && home.sections.length
    ? home.sections
    : [{ type: 'hero', enabled: true }, { type: 'categories', enabled: true, title: 'Browse by category', slugs: [] }, { type: 'newest', enabled: true, title: 'Just added', min: 4 }];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serialiseJsonLd(organisation) }}
      />

      <Hero products={products} copy={home} />

      <Sections sections={sections} />

      {/* E4: the strip this browser earned - nothing until it has opened two products. */}
      <div className="mx-auto max-w-5xl px-4 pb-8">
        <RecentlyViewed />
      </div>

      {/*
        The shop behind the site, with the real address.
        Two reasons beyond telling the story: Razorpay's website check and
        Merchant Center both want a verifiable business, and a Jaipur address in
        readable text is what ties this site to the Google Business Profile that
        already ranks for the operator.
      */}
      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">The shop behind it</h2>
            <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
              ShopMaster Pro is run from Jaipur by{' '}
              {business.legalName}. Independent sellers list here across every
              category, and every product page names the seller it comes from.
            </p>
            <p className="mt-3 text-[15px] leading-7 text-muted-foreground">
              You can walk into the shop. That is the point of putting the
              address here rather than a form.
            </p>
          </div>

          <div className="text-[15px] leading-7">
            <address className="not-italic text-muted-foreground">
              <strong className="text-foreground">{business.legalName}</strong>
              <br />
              {business.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block">{business.landmark}</span>
            </address>
            <p className="mt-3">
              <a href={business.phoneHref} className="text-brand-ink hover:underline">
                {business.phone}
              </a>
              <span className="block text-muted-foreground">{business.hours}</span>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
