import Link from 'next/link';
import { getProducts } from '@/lib/api';
import ProductMosaic from '@/components/home/ProductMosaic';

/**
 * The frame every sign-in screen sits in.
 *
 * WHAT WAS WRONG BEFORE
 *   The form was a 24rem column dropped into the middle of an otherwise empty
 *   catalogue page, under a full category strip. Nothing about it said "this
 *   screen has one job" - it read as a page whose content had failed to load.
 *
 * WHY A SPLIT AND NOT A BARE CENTRED FORM
 *   Both patterns are legitimate. A centred card is the safe default; a split
 *   is what consumer products use, because it turns a purely functional screen
 *   into the one place you can say what the account is FOR. Flipkart, Myntra
 *   and Nykaa all run a panel beside the form for exactly that reason. The
 *   rule the research attaches to it is the one that matters: whatever sits in
 *   the panel must be short, scannable, and must not compete with the form.
 *   So the panel is three lines about what an account does, and nothing else -
 *   no offers, no illustration carousel, nothing to read.
 *
 *   Below `lg` the panel is gone entirely and the card is the whole screen.
 *   A phone has no room for a second column, and the form is the job.
 *
 * WHAT IS IN THE PANEL, AND WHAT WAS
 *   It used to be three short paragraphs about what an account does. Rajat's
 *   objection was correct: nobody arrives at a sign-in screen to read. They
 *   want in, fast, and what persuades them the shop is worth entering is the
 *   GOODS, not a description of the account. So the panel is now a wall of real
 *   product photographs from the live catalogue and one line of text. The
 *   three things the paragraphs said are all still true, and all still on the
 *   policy pages - they were never the reason anybody signed in.
 *
 * HOW THE PANEL IS BUILT
 *   Mesh gradient rather than a single ramp, grain over it so it reads as a
 *   material, and the products on top. All from the shared effects layer, so
 *   nothing here is a one-off. The stops are deliberately dark, so white text
 *   and colourful photographs both sit on it comfortably.
 *
 * WHY THIS IS async
 *   It fetches six products. Cached for five minutes like every catalogue
 *   call, so four sign-in screens cost one request between them.
 */
export default async function AuthShell({ title, subtitle, children, footer = null }) {
  const latest = await getProducts({ limit: 6, sort: 'newest' });
  const products = latest?.products || [];

  return (
    // Fills the screen under the header: an auth screen that ends halfway down
    // with a strip of page below it looks unfinished, and the footer has
    // nothing to add to it.
    <div className="grid lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[1.1fr_1fr]">
      {/* THE PANEL. aria-hidden is deliberate: everything in it is decoration
          plus copy that is repeated in the footer of every page. A screen
          reader user should land on the form, not on a sales pitch. */}
      <aside
        aria-hidden="true"
        className="mesh grain relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-center"
      >
        <div className="relative mx-auto w-full max-w-md">
          <p className="text-sm font-medium tracking-wide uppercase opacity-70">ShopMaster Pro</p>
          <h2 className="mt-2 text-3xl leading-tight font-semibold tracking-tight text-balance">
            Everything from sellers across India, delivered to your door.
          </h2>

          {/* The goods. Six live listings, each one a link - the first thing a
              visitor sees is also the first thing they can buy. */}
          <ProductMosaic products={products} className="mt-8" />
        </div>
      </aside>

      {/* THE FORM SIDE. muted ground so the white card has something to sit on -
          a white card on a white page is just a border. */}
      <div className="flex items-center justify-center bg-muted/40 px-4 py-12 sm:px-6 lg:py-16">
        <div className="w-full max-w-[26rem]">
          <div className="rounded-xl border bg-card p-6 shadow-xs sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>

          {footer}

          {/*
           * Under the card, not inside it: it is a condition of using the site,
           * not a step in the form. Both pages need it - creating an account
           * and signing in are both acceptance.
           */}
          <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
            By continuing you agree to our{' '}
            <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
              terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
