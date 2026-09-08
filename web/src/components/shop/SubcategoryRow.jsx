import Link from 'next/link';
import { shopHref } from '@/lib/shopUrl';

/**
 * The subcategories of whatever branch is being looked at, above the grid.
 *
 * WHY THEY ARE HERE AND NOT ON A PAGE OF THEIR OWN
 *   Baymard's research says two things that pull in opposite directions, and
 *   which one applies depends on the size of the catalogue:
 *
 *     - On big sites, an intermediary category page is worth the extra click,
 *       and subcategory tiles should be the FIRST thing on it - 76% of sites
 *       bury them under banners and product carousels.
 *     - On small catalogues it is the opposite: intermediary pages "impede,
 *       rather than enhance" browsing, and testers who clicked a subcategory
 *       and landed on a page with NO PRODUCTS were disoriented and had to
 *       click again.
 *
 *   This shop has about fifty products. So: no intermediary page - the listing
 *   shows products straight away - but the subcategories sit above them, one
 *   tap away, because that is how people actually shop for jewellery. Somebody
 *   looking for earrings does not want "Jewellery"; they want to hop between
 *   Earrings, Jhumkas and Studs and see each set.
 *
 * WHY SIBLINGS, NOT JUST CHILDREN
 *   When a subcategory is already selected this shows its SIBLINGS, so moving
 *   from Rings to Bangles is one tap rather than a trip back up the tree. That
 *   hop is the whole reason the row exists.
 */
export default function SubcategoryRow({ categories, params }) {
  const selected = params.category;
  if (!selected) return null;

  // Which branch are we in? Either the selected category is a parent with
  // children, or it is a child and we want the family it belongs to.
  const parent =
    categories.find((c) => c.slug === selected) ||
    categories.find((c) => (c.children || []).some((child) => child.slug === selected));

  if (!parent) return null;

  const children = (parent.children || []).filter((c) => c.productCount > 0);
  if (children.length === 0) return null;

  const chip =
    'rounded-full border px-3 py-1.5 text-sm transition whitespace-nowrap';

  return (
    <nav aria-label={`Inside ${parent.name}`} className="mb-5">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={shopHref(params, { category: parent.slug })}
            className={`${chip} ${
              selected === parent.slug
                ? 'border-primary bg-primary/10 font-medium text-brand-ink'
                : 'border-border text-muted-foreground hover:border-primary hover:text-brand-ink'
            }`}
          >
            All {parent.name}{' '}
            <span className="text-xs">({parent.productCount})</span>
          </Link>
        </li>

        {children.map((child) => (
          <li key={child._id}>
            <Link
              href={shopHref(params, { category: child.slug })}
              className={`${chip} ${
                selected === child.slug
                  ? 'border-primary bg-primary/10 font-medium text-brand-ink'
                  : 'border-border text-muted-foreground hover:border-primary hover:text-brand-ink'
              }`}
            >
              {child.name} <span className="text-xs">({child.productCount})</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
