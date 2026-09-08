import Link from 'next/link';
import Logo from '@/components/brand/Logo';
import HeaderAccount from '@/components/layout/HeaderAccount';
import CategoryBar from '@/components/layout/CategoryBar';
import MobileNav from '@/components/layout/MobileNav';
import HideOnAuthPages from '@/components/layout/HideOnAuthPages';
import ThemeToggle from '@/components/layout/ThemeToggle';
import { getCategories } from '@/lib/api';

/**
 * The bar every page carries.
 *
 * Deliberately thin. A shopper arriving from Google is one tap from the thing
 * they searched for; a header full of chrome is a header they scroll past.
 *
 * It is a server component and has no state, so it costs nothing in JavaScript
 * on the client - which matters because it is on every page including the
 * product page Google measures.
 */
export default async function Header() {
  /*
   * Fetched once here and handed to both: the strip below draws it on a wide
   * screen, the drawer on a narrow one. Two fetches of the same tree would be
   * two chances for them to disagree.
   */
  const categories = (await getCategories()).filter((c) => c.productCount > 0);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-1">
          {/* Only on a phone. On a wide screen the category bar below is
              already open, and hiding it there would be exactly the mistake
              the research warns about. */}
          <MobileNav categories={categories} />

          <Link href="/" aria-label="ShopMaster Pro, home" className="shrink-0">
            <Logo />
          </Link>
        </div>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/shop" className="font-medium hover:text-brand-ink">
            Shop
          </Link>
          <Link href="/contact" className="text-muted-foreground hover:text-brand-ink">
            Contact
          </Link>
          <HeaderAccount />
          <ThemeToggle />
        </nav>
      </div>

      {/* Inside the sticky header, so the way into every category travels down
          the page with the shopper rather than being left at the top - except
          on the sign-in screens, where eleven categories are eleven ways to
          abandon what you came to do. */}
      <HideOnAuthPages>
        <CategoryBar categories={categories} />
      </HideOnAuthPages>
    </header>
  );
}
