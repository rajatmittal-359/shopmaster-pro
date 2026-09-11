import Link from 'next/link';
import ProductMosaic from '@/components/home/ProductMosaic';

/**
 * The first screen.
 *
 * WHAT CHANGED, AND WHY
 *   The first version was a headline, a paragraph and two buttons, with the
 *   products starting below the fold. Rajat's objection is the one every
 *   home-page study makes: people do not arrive to read. They arrive to see
 *   whether there is anything here for them, and they decide in a glance. So
 *   the copy is one line, the padding is half what it was, and the right half
 *   of the screen is a wall of real products - which is what Meesho, Myntra
 *   and Amazon all put in the first screen instead of prose.
 *
 * WHAT IT STILL SAYS
 *   "A marketplace from Jaipur" - not "a jewellery shop". The promise is
 *   VARIETY, the same one every large marketplace makes, and the wall of
 *   products is now making it visually rather than in a sentence.
 *
 * THE EFFECT
 *   Two blurred blooms drifting behind the words, CSS only. The LCP element is
 *   either the heading or the first mosaic image, which is given `priority`
 *   so it is not lazy-loaded below the fold it is actually in.
 */
export default function Hero({ products = [] }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="smp-bloom absolute -top-32 -left-24 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="smp-bloom smp-bloom--slow absolute top-10 -right-20 h-80 w-80 rounded-full bg-brand-rose/15 blur-3xl" />
      </div>

      <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-10 sm:py-14 md:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-medium text-brand-ink">Jaipur, since the family shop</p>

          <h1 className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            A marketplace from Jaipur, delivered across India.
          </h1>

          {/* One line. Everything the paragraph used to say, the wall of
              products now shows. */}
          <p className="mt-3 max-w-md text-base text-muted-foreground">
            Clothing, jewellery, home and everyday things from sellers across India.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/shop"
              className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground transition hover:opacity-90"
            >
              Shop everything
            </Link>
            <Link
              href="/shop?sort=newest"
              className="rounded-lg border border-border px-5 py-2.5 font-medium transition hover:bg-accent"
            >
              What is new
            </Link>
          </div>
        </div>

        {/* Hidden below md: on a phone the category grid is one scroll away and
            a mosaic above it would push the headline off the first screen. */}
        <ProductMosaic products={products} priority className="hidden md:grid" />
      </div>
    </section>
  );
}
