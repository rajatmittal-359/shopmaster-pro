import PolicyHeading from '@/components/policy/PolicyHeading';
import Section from '@/components/policy/Section';

export const metadata = {
  title: 'How products are ranked',
  description: 'The factors that decide the order of products and shops on ShopMaster Pro, in plain words.',
  /*
   * Without this the root layout's default applies and the page tells Google
   * the HOME page is the canonical one - which is an instruction not to index
   * this page at all (24 Sep 2026, from a Search Console mail). Of all the
   * pages to lose, the ranking promise is the worst: rule 5(3)(e) asks for it
   * to be published, and a sceptical seller is exactly who searches for it.
   */
  alternates: { canonical: '/how-we-rank' },
};

/*
 * Consumer Protection (E-Commerce) Rules 2020, rule 5(3)(e) - and the 2026
 * amendment, in force 1 January 2027 - ask a marketplace to publish, in
 * plain language, the main parameters that determine the ranking of goods
 * and sellers, and their relative importance. This page describes what the
 * code actually does (controllers/productController SORTS, utils/atlasSearch,
 * the semantic top-up); when the code changes, this page changes with it.
 */
export default function HowWeRankPage() {
  return (
    <>
      <PolicyHeading title="How products are ranked" updated="15 September 2026" />

      <Section title="The short version">
        <p>
          Nobody pays to appear higher. There are no sponsored slots, no paid boosts, and
          no seller - including any shop connected to the people who run the platform -
          is ranked ahead of another by design. The order you see comes from the factors
          below, and from nothing else.
        </p>
      </Section>

      <Section title="On the shop and category pages">
        <p>
          By default, products are shown <strong>newest first</strong>. You can change the
          order to price (low to high, high to low), <strong>rating</strong> (highest average
          first; among equal averages, the product with more reviews comes first, so one
          five-star review does not outrank fifty at 4.6) or <strong>popularity</strong>
          (most reviews first). Only products that are in stock and whose seller is
          approved appear at all.
        </p>
      </Section>

      <Section title="When you search">
        <p>
          Results are ordered by how well the words you typed match the product, in this
          order of weight: the product <strong>name</strong> first, then its search words,
          brand and colour, then the description. Small spelling differences are
          tolerated. When a search is close to your words in meaning but not in
          spelling, a semantic match tops the list up after the direct matches. Ratings,
          price and seller play no part in search order unless you choose a sort.
        </p>
      </Section>

      <Section title="What sellers can and cannot do">
        <p>
          A seller can improve where a product appears only by making the listing better:
          a clear name, a real description, photos, size and colour, honest search words.
          The panel shows sellers a <strong>listing quality score</strong> for exactly this;
          it affects how Google and other search engines see the page, not the order on
          this site. A seller cannot buy position, and the platform does not adjust
          search results or indexes for any seller.
        </p>
      </Section>

      <Section title="Shops">
        <p>
          A shop&rsquo;s rating is the review-weighted average across its products, so a
          shop with fifty reviews at 4.2 reads higher than one with a single five-star
          review. Shops are not ranked against each other anywhere on the site.
        </p>
      </Section>
    </>
  );
}
