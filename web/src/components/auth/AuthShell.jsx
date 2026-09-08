import Link from 'next/link';
import { PackageCheck, RotateCcw, Store } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';

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
 * WHY THE PANEL USES THE BRAND GRADIENT
 *   It is the site's own three stops - violet, indigo, cyan - read from the
 *   same tokens every other gradient surface reads from, so re-theming the
 *   site re-themes this too. The text on it is white, which the palette is
 *   built to carry.
 *
 * THE THREE LINES ARE THINGS THIS SITE ACTUALLY DOES
 *   Real courier scans, saved addresses at checkout, a returns policy written
 *   down. Nothing here is a promise the software does not keep.
 */
const POINTS = [
  {
    icon: PackageCheck,
    title: 'Follow every order',
    body: 'Real courier scans and an expected delivery date, not just "shipped".',
  },
  {
    icon: RotateCcw,
    title: 'Returns you can read first',
    body: 'The window, the refund and who pays the courier - written down before you buy.',
  },
  {
    icon: Store,
    title: 'One account buys and sells',
    body: 'Start selling later without a second login, a second cart or a second password.',
  },
];

export default function AuthShell({ title, subtitle, children, footer = null }) {
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
        className="relative hidden overflow-hidden bg-linear-to-br from-brand-from via-brand-via to-brand-to p-12 text-white lg:flex lg:flex-col lg:justify-center"
      >
        {/* The flat mark, oversized and bled off the corner. It is texture, not
            a second logo - which is why it is cropped, and why it is the
            silhouette rather than the tile: a second tile on the same screen
            reads as a mistake. */}
        <LogoMark className="pointer-events-none absolute -right-20 -bottom-24 h-96 w-96 text-white/8" />

        <div className="relative max-w-md">
          <p className="text-sm font-medium tracking-wide uppercase opacity-70">ShopMaster Pro</p>
          <h2 className="mt-3 text-4xl leading-[1.1] font-semibold tracking-tight text-balance">
            One account for everything you buy here.
          </h2>

          <ul className="mt-10 space-y-7">
            {POINTS.map(({ icon: Icon, title: heading, body }) => (
              <li key={heading} className="flex gap-4">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/25">
                  <Icon className="size-4.5" strokeWidth={2} />
                </span>
                <div>
                  <p className="font-medium">{heading}</p>
                  <p className="mt-0.5 text-sm opacity-80">{body}</p>
                </div>
              </li>
            ))}
          </ul>
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
