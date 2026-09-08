import Link from 'next/link';
import Logo from '@/components/brand/Logo';
import HeaderAccount from '@/components/layout/HeaderAccount';
import CategoryBar from '@/components/layout/CategoryBar';
import MobileNav from '@/components/layout/MobileNav';
import HideOnAuthPages from '@/components/layout/HideOnAuthPages';
import ThemeToggle from '@/components/layout/ThemeToggle';
import SearchBox from '@/components/search/SearchBox';
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
 *
 * The bar is frosted rather than opaque: it is the one surface on the site that
 * is ALWAYS floating over content, which is exactly where the research says
 * glass earns its cost. It uses the shared `.glass`, so it cannot drift away
 * from the dialogs and the drawer.
 */
export default async function Header() {
  /*
   * Fetched once here and handed to both: the strip below draws it on a wide
   * screen, the drawer on a narrow one. Two fetches of the same tree would be
   * two chances for them to disagree.
   */
  const categories = (await getCategories()).filter((c) => c.productCount > 0);
  return (
    <header className="glass sticky top-0 z-40 border-b">
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

        {/*
          Search sits between the mark and the account, which is where every
          reference puts it and where the eye already goes. It is a FIELD, not
          an icon: Baymard is explicit that hiding search behind a magnifying
          glass costs use, and for anyone hunting a specific thing search beats
          navigation outright.
        */}
        <SearchBox className="hidden max-w-md flex-1 md:block" />

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/shop" className="hidden font-medium hover:text-brand-ink sm:inline">
            Shop
          </Link>
          <Link href="/contact" className="hidden text-muted-foreground hover:text-brand-ink sm:inline">
            Contact
          </Link>
          <HeaderAccount />
          <ThemeToggle />
        </nav>
      </div>

      {/*
        The phone's search row. It gets a line of its own because there is no
        room beside a logo, and it stays VISIBLE rather than folding into an
        icon for the same reason it does on a desktop.
      */}
      <HideOnAuthPages>
        <div className="border-t px-4 py-2 md:hidden">
          <SearchBox />
        </div>
      </HideOnAuthPages>

      {/*
        Inside the sticky header, so the way into every category travels down
        the page with the shopper rather than being left at the top - except on
        the sign-in screens, where eleven categories are eleven ways to abandon
        what you came to do.

        Hidden on a phone, and this is a trade rather than an oversight: with a
        search row above it the sticky header would eat close to a quarter of a
        phone screen permanently. The drawer carries the whole two-level tree,
        the home page opens on a category grid, and the research is clear that
        for finding a specific thing search beats browsing anyway. So the phone
        gets the field and the wide screen keeps the strip.
      */}
      <HideOnAuthPages>
        <div className="hidden md:block">
          <CategoryBar categories={categories} />
        </div>
      </HideOnAuthPages>
    </header>
  );
}
