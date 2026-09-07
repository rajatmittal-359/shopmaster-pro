import Link from 'next/link';
import Logo from '@/components/brand/Logo';

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
export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" aria-label="ShopMaster Pro, home" className="shrink-0">
          <Logo markClassName="text-primary" />
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/shop" className="font-medium hover:text-brand-ink">
            Shop
          </Link>
          <Link href="/contact" className="text-muted-foreground hover:text-brand-ink">
            Contact
          </Link>
        </nav>
      </div>
    </header>
  );
}
