import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Not found' };

/**
 * The 404.
 *
 * WHY IT OFFERS ROUTES RATHER THAN AN APOLOGY
 *   Most people land here from an old link or a typo in a shared URL. What they
 *   wanted was a product, and the fastest way back to one is the shop - not a
 *   sad face and a home button.
 *
 * It is a REAL 404 status because the pages that call notFound() do so before
 * anything streams. A soft 404 - a 200 saying "not found" - is a page Google
 * indexes as real content.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">That page is not here</h1>
      <p className="mt-2 text-muted-foreground">
        It may have moved, or the link may have been mistyped. The shop is a
        good place to start.
      </p>

      <div className="mt-6 flex justify-center gap-3">
        <Button asChild>
          <Link href="/shop">Browse the shop</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/contact">Ask us</Link>
        </Button>
      </div>
    </div>
  );
}
