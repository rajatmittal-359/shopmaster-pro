import Link from 'next/link';
import { BUSINESS, POLICY_PAGES } from '@/config/policy';

/**
 * WHY THE FOOTER CARRIES THE ADDRESS AND NOT JUST LINKS
 *   Razorpay re-checks the site for a real postal address, a working phone and
 *   a working email, and Google Merchant Center asks for the same before it
 *   lists products for free. Both look at whatever page they happen to load -
 *   so the details live on every page, not only on /contact.
 *
 *   It is also what a stranger looks for before paying a shop they have never
 *   heard of: who is this, and where are they if it goes wrong.
 */
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-muted/40">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 text-sm sm:grid-cols-2">
        <div>
          <p className="font-semibold">{BUSINESS.tradeName}</p>
          <p className="mt-1 text-muted-foreground">
            A marketplace operated by {BUSINESS.legalName}.
          </p>
          <p className="mt-2">
            <Link href="/sell" className="text-brand-ink hover:underline">
              Sell on ShopMaster Pro
            </Link>
          </p>

          <address className="mt-3 not-italic text-muted-foreground">
            {BUSINESS.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>

          <p className="mt-3">
            <a href={BUSINESS.phoneHref} className="text-brand-ink hover:underline">
              {BUSINESS.phone}
            </a>
            <br />
            <a href={`mailto:${BUSINESS.email}`} className="text-brand-ink hover:underline">
              {BUSINESS.email}
            </a>
            <br />
            <span className="text-muted-foreground">{BUSINESS.hours}</span>
          </p>
        </div>

        <nav aria-label="Policies">
          <p className="font-semibold">Help &amp; policies</p>
          <ul className="mt-3 space-y-2">
            {POLICY_PAGES.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="text-muted-foreground hover:text-brand-ink">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <p className="mx-auto max-w-5xl px-4 py-4 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} {BUSINESS.legalName}. Prices in Indian
          Rupees, inclusive of taxes.
        </p>
      </div>
    </footer>
  );
}
