import Link from 'next/link';

/**
 * The strip of categories under the header - the thing Amazon and Flipkart open
 * with, and the fastest way into a marketplace that sells more than one kind of
 * thing.
 *
 * NO JAVASCRIPT. The panels open on `group-hover` and `group-focus-within`,
 * which is CSS. Three consequences, all of them the point:
 *   - a crawler reads every category and subcategory link in the HTML, on every
 *     page of the site, which is how the deeper categories get found at all;
 *   - it works before hydration, so it is not dead for the first second on a
 *     slow phone;
 *   - focus-within means the keyboard opens the same panel the mouse does,
 *     without an onKeyDown handler to get wrong.
 *
 * ON A PHONE there are no panels: the strip scrolls sideways and a tap goes
 * straight to the category. A hover menu on a touch screen is a menu that opens
 * when you are trying to tap through it.
 *
 * IT IS BUILT FROM THE LIVE TREE, counts and all, so a new category appears
 * here by itself and one with nothing in it never does - a tile leading to an
 * empty grid is worse than one tile fewer.
 */
export default function CategoryBar({ categories = [] }) {
  const shown = categories.filter((c) => c.productCount > 0);

  if (shown.length === 0) return null;

  return (
    <nav aria-label="Categories" className="border-b border-border bg-background">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 text-sm md:overflow-visible">
        {shown.map((cat) => {
          const children = (cat.children || []).filter((c) => c.productCount > 0);

          return (
            <li key={cat._id} className="group relative shrink-0">
              <Link
                href={`/shop?category=${cat.slug}`}
                className="block whitespace-nowrap px-3 py-2.5 text-muted-foreground transition hover:text-brand-ink group-hover:text-brand-ink"
              >
                {cat.name}
              </Link>

              {children.length > 0 && (
                <div className="invisible absolute left-0 top-full z-50 hidden min-w-56 rounded-b-xl border border-t-0 border-border bg-background p-3 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 md:block">
                  <ul className="space-y-1">
                    {children.map((child) => (
                      <li key={child._id}>
                        <Link
                          href={`/shop?category=${child.slug}`}
                          className="block rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-brand-ink"
                        >
                          {child.name}{' '}
                          <span className="text-xs">({child.productCount})</span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={`/shop?category=${cat.slug}`}
                    className="mt-2 block border-t border-border px-2 pt-2 text-xs text-brand-ink hover:underline"
                  >
                    All {cat.name} ({cat.productCount})
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
