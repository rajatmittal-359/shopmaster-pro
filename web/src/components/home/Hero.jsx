import Link from 'next/link';

/**
 * The first screen.
 *
 * WHAT IT SAYS AND WHY
 *   "A marketplace from Jaipur" - not "a jewellery shop", and not "our
 *   jewellery plus other people's things" either. Both are wrong the day the
 *   catalogue widens, and the second one advertises which seller the platform
 *   owns, which is nobody's business but ours. The promise is VARIETY - the
 *   same promise every large marketplace makes - so the categories are listed
 *   without any of them being claimed.
 *
 * THE EFFECT
 *   Two blurred marigold blooms drifting slowly behind the words. It is CSS -
 *   no canvas, no library, nothing to download before the page can paint - and
 *   the LCP element is the heading itself, which is text, so this cannot slow
 *   the thing Google measures. Motion stops entirely under
 *   prefers-reduced-motion; the colour stays.
 */
export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* Decoration only, and hidden from screen readers as such. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="smp-bloom absolute -left-24 -top-32 h-96 w-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="smp-bloom smp-bloom--slow absolute -right-20 top-10 h-80 w-80 rounded-full bg-brand-ink/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-20 sm:py-28">
        <p className="text-sm font-medium text-brand-ink">Jaipur, since the family shop</p>

        <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          A marketplace from Jaipur, delivered across India.
        </h1>

        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Clothing, jewellery, electronics, home and everyday things - from
          sellers across India. One cart, one place to track it all, and a
          returns policy written in plain words.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/shop"
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:opacity-90"
          >
            Shop everything
          </Link>
          <Link
            href="/shop?sort=newest"
            className="rounded-lg border border-border px-6 py-3 font-medium transition hover:bg-accent"
          >
            What is new
          </Link>
        </div>
      </div>
    </section>
  );
}
