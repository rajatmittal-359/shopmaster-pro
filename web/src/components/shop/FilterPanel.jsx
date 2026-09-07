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
          {categories.map((cat) => (
            <li key={cat._id}>
              <Link
                href={shopHref(params, { category: cat.slug })}
                className={active('category', cat.slug) ? 'font-medium text-brand-ink' : 'text-muted-foreground hover:text-brand-ink'}
              >
                {cat.name}{' '}
                <span className="text-xs text-muted-foreground">({cat.productCount})</span>
              </Link>
            </li>
          ))}
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
