import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProducts, getFilters, getCategories } from '@/lib/api';
import { serialiseJsonLd } from '@/lib/jsonLd';
import { shopHref } from '@/lib/shopUrl';
import ProductCard from '@/components/product/ProductCard';
import FilterPanel from '@/components/shop/FilterPanel';
import SortSelect from '@/components/shop/SortSelect';
import AppliedFilters from '@/components/shop/AppliedFilters';
import Pagination from '@/components/shop/Pagination';
import SubcategoryRow from '@/components/shop/SubcategoryRow';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';
const PER_PAGE = 24;

/** Only these come off the URL. Anything else is ignored, not passed through. */
const READ = [
  'category',
  'search',
  'color',
  'size',
  'minRating',
  'minPrice',
  'maxPrice',
  'sort',
  'page',
];

const cleanParams = (raw) => {
  const out = {};
  for (const key of READ) {
    const value = Array.isArray(raw[key]) ? raw[key][0] : raw[key];
    if (value) out[key] = String(value);
  }
  return out;
};

/**
 * A filtered view is NOT indexed.
 *
 * Colour, price, rating and sort multiply into hundreds of URLs that all show
 * the same products in a different order. Google calls that index bloat and
 * spends the crawl budget of a small shop on it. Categories and search results
 * are real pages; a price band is not.
 */
const isFiltered = (params) =>
  Boolean(
    params.color ||
      params.size ||
      params.minRating ||
      params.minPrice ||
      params.maxPrice ||
      params.sort
  );

export async function generateMetadata({ searchParams }) {
  const params = cleanParams(await searchParams);
  const categories = params.category ? await getCategories() : [];
  const category = findCategory(categories, params.category);

  const title = params.search
    ? `Search: ${params.search}`
    : category
      ? category.name
      : 'Shop';

  return {
    title,
    description: category
      ? `${category.name} from Charming Jewels, Jaipur. Delivered across India with 7-day returns.`
      : 'Jewellery, clothing, home and more from independent sellers in India. Delivered across India with 7-day returns.',
    alternates: { canonical: shopHref({ category: params.category, page: params.page }) },
    robots: isFiltered(params) || params.search ? { index: false, follow: true } : undefined,
  };
}

/** Depth-first, because a category can be a child of a child. */
function findCategory(categories, slug) {
  if (!slug) return null;
  for (const cat of categories) {
    if (cat.slug === slug) return cat;
    const inChildren = findCategory(cat.children || [], slug);
    if (inChildren) return inChildren;
  }
  return null;
}

export default async function ShopPage({ searchParams }) {
  const params = cleanParams(await searchParams);
  const page = Math.max(1, Number(params.page) || 1);

  const [data, filters, categories] = await Promise.all([
    getProducts({ ...params, page, limit: PER_PAGE }),
    getFilters(params),
    getCategories(),
  ]);

  // A category slug nobody has ever created is a 404, and it has to be decided
  // before anything is returned - after that the response is already a 200.
  if (data?.notFound) notFound();

  const products = data?.products || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 0;
  const category = findCategory(categories, params.category);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {products.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serialiseJsonLd({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              itemListElement: products.map((p, i) => ({
                '@type': 'ListItem',
                position: (page - 1) * PER_PAGE + i + 1,
                url: `${SITE}/products/${p.slug || p._id}`,
                name: p.name,
              })),
            }),
          }}
        />
      )}

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {params.search ? `Results for "${params.search}"` : category ? category.name : 'Shop'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} {total === 1 ? 'piece' : 'pieces'}
          {totalPages > 1 ? ` · page ${page} of ${totalPages}` : ''}
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[13rem_1fr]">
        <FilterPanel
          params={params}
          categories={categories}
          colors={filters.colors || []}
          sizes={filters.sizes || []}
          price={filters.price}
        />

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <AppliedFilters params={params} categoryName={category?.name} />
            <div className="ml-auto">
              <SortSelect params={params} />
            </div>
          </div>

          {/* Above the grid, never instead of it - see the note in the
              component about small catalogues and intermediary pages. */}
          <SubcategoryRow categories={categories} params={params} />

          {products.length === 0 ? (
            <NoResults params={params} categoryName={category?.name} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          )}

          <Pagination params={params} page={page} totalPages={totalPages} />
        </div>
      </div>
    </div>
  );
}

/**
 * The empty grid, done properly.
 *
 * Baymard: "nearly 50% of sites fail to provide users with effective ways to
 * recover from a search that yields no results." The failure mode is always the
 * same - the grid simply renders nothing and the shopper leaves. This says what
 * was searched, offers to drop each filter ONE AT A TIME rather than only
 * "clear everything", and ends with a way back into the catalogue.
 */
function NoResults({ params, categoryName }) {
  const applied = ['color', 'size', 'minRating', 'minPrice', 'maxPrice'].filter((k) => params[k]);

  return (
    <div className="rounded-xl border border-border p-8 text-center">
      <p className="font-medium">
        {params.search
          ? `Nothing matched "${params.search}"`
          : `Nothing here${categoryName ? ` in ${categoryName}` : ''} just now`}
      </p>

      {applied.length > 0 ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Try removing one of these rather than starting again:
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {applied.map((key) => (
              <Link
                key={key}
                href={shopHref(params, { [key]: '' })}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                Without the{' '}
                {key === 'minRating'
                  ? 'rating'
                  : key === 'color'
                    ? 'colour'
                    : key === 'size'
                      ? 'size'
                      : 'price'}{' '}
                filter
              </Link>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          The stock changes often - it is worth looking again.
        </p>
      )}

      <p className="mt-6">
        <Link href="/shop" className="text-brand-ink hover:underline">
          See everything in the shop
        </Link>
      </p>
    </div>
  );
}
