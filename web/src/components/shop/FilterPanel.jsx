import Link from 'next/link';
import { shopHref } from '@/lib/shopUrl';
import PriceFilter from '@/components/shop/PriceFilter';

/**
 * The filters, and only these.
 *
 * Baymard's five essentials are Price, Rating, Colour, Size and Brand. Brand is
 * excluded by their own rule on a single-brand site, and Size is meaningless on
 * adjustable jewellery - so what is left is Price, Category, Colour, Rating.
 * 80% of shoppers apply a price filter whatever they are buying; only 47% of
 * sites offer a rating filter at all, which is the largest gap in the industry.
 *
 * A SERVER COMPONENT. Every option is a LINK, so each filtered view has a real
 * URL that can be shared, bookmarked and crawled - and the panel costs no
 * JavaScript. Only the price box needs a browser, and that is its own island.
 */
export default function FilterPanel({ params, categories, colors, price }) {
  const active = (key, value) => String(params[key] || '') === String(value);

  return (
    <aside className="space-y-6 text-sm">
      <section>
        <h2 className="font-semibold">Category</h2>
        <ul className="mt-2 space-y-1">
          <li>
            <Link
              href={shopHref(params, { category: '' })}
              className={!params.category ? 'font-medium text-brand-ink' : 'text-muted-foreground hover:text-brand-ink'}
            >
              Everything
            </Link>
          </li>
          {categories.map((cat) => {
            const children = (cat.children || []).filter((c) => c.productCount > 0);
            /*
             * A main category's children are shown when that branch is the one
             * being looked at - either the parent is selected, or one of its
             * children is. Showing every subcategory of every category at once
             * turns a sidebar into a wall; hiding them entirely (which this
             * panel did at first) means the only way into "Earrings" is the
             * hover menu, which does not exist on a phone.
             */
            const inThisBranch =
              active('category', cat.slug) || children.some((c) => active('category', c.slug));

            return (
              <li key={cat._id}>
                <Link
                  href={shopHref(params, { category: cat.slug })}
                  className={
                    active('category', cat.slug)
                      ? 'font-medium text-brand-ink'
                      : 'text-muted-foreground hover:text-brand-ink'
                  }
                >
                  {cat.name}{' '}
                  <span className="text-xs text-muted-foreground">({cat.productCount})</span>
                </Link>

                {inThisBranch && children.length > 0 && (
                  <ul className="mt-1 space-y-1 border-l border-border pl-3">
                    {children.map((child) => (
                      <li key={child._id}>
                        <Link
                          href={shopHref(params, { category: child.slug })}
                          className={
                            active('category', child.slug)
                              ? 'font-medium text-brand-ink'
                              : 'text-muted-foreground hover:text-brand-ink'
                          }
                        >
                          {child.name}{' '}
                          <span className="text-xs text-muted-foreground">
                            ({child.productCount})
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {colors.length > 0 && (
        <section>
          <h2 className="font-semibold">Colour</h2>
          <ul className="mt-2 space-y-1">
            {colors.map((c) => (
              <li key={c.value}>
                <Link
                  href={shopHref(params, { color: active('color', c.value) ? '' : c.value })}
                  className={active('color', c.value) ? 'font-medium text-brand-ink' : 'text-muted-foreground hover:text-brand-ink'}
                >
                  {c.value} <span className="text-xs">({c.count})</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PriceFilter params={params} range={price} />

      <section>
        <h2 className="font-semibold">Rating</h2>
        <ul className="mt-2 space-y-1">
          {[4, 3].map((r) => (
            <li key={r}>
              <Link
                href={shopHref(params, { minRating: active('minRating', r) ? '' : r })}
                className={active('minRating', r) ? 'font-medium text-brand-ink' : 'text-muted-foreground hover:text-brand-ink'}
              >
                {r} stars and up
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
