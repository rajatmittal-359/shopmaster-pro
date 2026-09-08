import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { BUSINESS } from '@/config/policy';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en-IN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Header />
        {/* flex-1 so a short page still pushes the footer to the bottom. */}
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
