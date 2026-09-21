import { Geist, Geist_Mono, Fraunces } from 'next/font/google';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { BUSINESS } from '@/config/policy';
import ThemeProvider from '@/components/theme/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { ReauthProvider } from '@/components/common/Reauth';
import ShopChrome from '@/components/layout/ShopChrome';
import { Suspense } from 'react';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import MetaPixel from '@/components/analytics/MetaPixel';
import ConsentBanner from '@/components/common/ConsentBanner';
import GoogleOneTap from '@/components/auth/GoogleOneTap';
import CartDrawer from '@/components/cart/CartDrawer';
import BottomNav from '@/components/layout/BottomNav';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/*
 * The display face (E1, 22 Sep 2026): Fraunces, for the storefront's hero and
 * section titles only - the one place a marketplace earns its own voice
 * (Etsy, Myntra's editorial, every premium jewellery site pairs a display
 * serif with a working sans). Self-hosted by next/font with `display: swap`
 * and one weight, so DESIGN.md's reason for a single family - a webfont
 * flashing on 4G - does not apply: it is inlined and served like Geist is.
 * Panels, forms and tables stay Geist.
 */
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  // Variable font, one style: the optical-size and SOFT axes come along, the
  // weight is set in CSS (.font-display). ~40 KB woff2, subset to latin.
  weight: 'variable',
  style: ['normal'],
  axes: ['opsz', 'SOFT'],
  display: 'swap',
});

/**
 * metadataBase is what turns every relative canonical and og:image below into
 * an absolute URL. Without it Next emits relative ones, and a relative
 * canonical is a canonical Google ignores.
 *
 * The title template means a page sets only its own name: "Contact us" becomes
 * "Contact us | ShopMaster Pro". The old React app appended the site name by
 * hand and one page ended up reading it twice.
 */
export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://shopmasterpro.in'),
  title: {
    default: 'ShopMaster Pro - a marketplace from Jaipur',
    template: '%s | ShopMaster Pro',
  },
  /*
   * NOT "a jewellery shop", and it does not say which seller the platform
   * owns. Chrome copy naming one category dates the moment a seller joins who
   * sells something else, and it misdescribes their products to Google.
   * Category words belong on the product and the category, never in the frame
   * around them - and the frame's promise is variety, which is the promise
   * every marketplace makes because it is the one that stays true.
   */
  description:
    'Clothing, jewellery, electronics, home and everyday things from sellers ' +
    'across India. Delivered nationwide, with returns and refunds you can read ' +
    'before you buy.',
  alternates: { canonical: '/' },
  // The card's small print: WhatsApp/LinkedIn print the site name under the title. A child
  // page that sets its own openGraph replaces this whole object, so it repeats siteName.
  openGraph: { siteName: 'ShopMaster Pro', locale: 'en_IN', type: 'website' },
};

export default function RootLayout({ children }) {
  return (
    /*
     * suppressHydrationWarning is required, not optional: next-themes writes
     * the theme class onto <html> before React hydrates, so the server's markup
     * and the browser's differ by design on this one element.
     */
    <html
      lang="en-IN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {/* scripts/run.js sets ENV_MODE when the laptop runs against production
            data read-only: a bar nobody can miss, so a dev tab is never mistaken
            for the live shop (and vice versa). Never set in a real deployment. */}
        {process.env.ENV_MODE === 'prod-read' && (
          <div className="bg-red-700 px-4 py-1 text-center text-xs font-semibold tracking-wide text-white">
            PROD DATA · READ-ONLY · local server
          </div>
        )}
        <ThemeProvider>
          <ReauthProvider>
          {/* The storefront's chrome, on storefront routes only. The seller and
              admin panels are their own application and bring their own bar -
              a shop's header on top of a dashboard is neither. */}
          <ShopChrome>
            <Header />
            {/* One Tap for signed-out visitors - storefront only, never in the panels. */}
            <GoogleOneTap />
            <CartDrawer />
          </ShopChrome>
          {/* flex-1 so a short page still pushes the footer to the bottom. */}
          {/* pb on phones so the bottom tab bar never covers the last row. */}
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <ShopChrome>
            <Footer />
            <BottomNav />
          </ShopChrome>
          {/* One toaster for the whole site: undo after a removal, a word after
              a save. Bottom-right, out of the way of the sticky buy bar. */}
          <Toaster position="bottom-right" richColors closeButton />
          {/* The cookie choice - only when a tag is configured and the host is real. */}
          <ConsentBanner />
          </ReauthProvider>
        </ThemeProvider>
        {/* GA4 - loads nothing until NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
            Meta Pixel - nothing until NEXT_PUBLIC_META_PIXEL_ID is set AND the visitor accepted. */}
        <Suspense fallback={null}>
          <GoogleAnalytics />
          <MetaPixel />
        </Suspense>
      </body>
    </html>
  );
}
