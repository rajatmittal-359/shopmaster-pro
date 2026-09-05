// frontend/src/pages/customer/HomePage.jsx
import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import ProductCard from '../../components/customer/ProductCard';
import FilterSidebar from '../../components/customer/FilterSidebar';
import { getProducts, getCategories } from '../../services/productService';
import { useSearchParams } from 'react-router-dom';
import Loader from '../../components/common/Loader';
import Seo from '../../components/common/Seo';
import { SlidersHorizontal, X } from 'lucide-react';

export default function HomePage() {
  // The category lives in the URL so a category page is shareable, bookmarkable
  // and indexable. Previously it was local state only, so every category showed
  // the same /shop URL and search engines saw one page instead of many.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCategory = searchParams.get('category') || '';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });

  /** The filter sheet, on phones only. */
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    category: urlCategory,
    minPrice: '',
    maxPrice: '',
    sortBy: 'newest',
  });

  // Load categories once
  useEffect(() => {
    (async () => {
      try {
        const res = await getCategories();
        setCategories(res.data.categories || []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  // Load products whenever filters/page change
  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, meta.page]);

  const loadProducts = async () => {
    try {
      setLoading(true);

      const params = {
        page: meta.page,
        limit: 12,
      };

      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.category) params.category = filters.category;
      if (filters.minPrice) params.minPrice = filters.minPrice;
      if (filters.maxPrice) params.maxPrice = filters.maxPrice;

      const res = await getProducts(params);
      const { products, totalPages, currentPage, total } = res.data;

      setProducts(products || []);
      setMeta({
        page: currentPage || 1,
        totalPages: totalPages || 1,
        total: total || 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setFilters((prev) => ({
      ...prev,
      search: value,
    }));
    setMeta((prev) => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (name, value) => {
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
    setMeta((prev) => ({ ...prev, page: 1 }));

    if (name === 'category') {
      const next = new URLSearchParams(searchParams);
      if (value) next.set('category', value);
      else next.delete('category');
      setSearchParams(next, { replace: true });
    }
  };

  const handleClearFilters = () => {
    setSearchParams({}, { replace: true });
    setFilters({
      search: '',
      category: '',
      minPrice: '',
      maxPrice: '',
      sortBy: 'newest',
    });
    setMeta({ page: 1, totalPages: 1, total: 0 });
  };

  const handlePageChange = (direction) => {
    setMeta((prev) => {
      if (direction === 'prev' && prev.page > 1) {
        return { ...prev, page: prev.page - 1 };
      }
      if (direction === 'next' && prev.page < prev.totalPages) {
        return { ...prev, page: prev.page + 1 };
      }
      return prev;
    });
  };

  // Client-side sort for current page
const getSortedProducts = () => {
  const copy = [...products];
  switch (filters.sortBy) {
    case 'price_low_high':
      return copy.sort((a, b) => (a.price || 0) - (b.price || 0));
    case 'price_high_low':
      return copy.sort((a, b) => (b.price || 0) - (a.price || 0));
    case 'name_asc':
      return copy.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    case 'newest':
    default:
      return copy;
  }
};


  const sortedProducts = getSortedProducts();

  const activeCategory = categories.find((c) => c._id === filters.category);

  /**
   * How many filters are actually narrowing the list. Shown on the Filters
   * button so a phone shopper can tell at a glance why they are seeing fewer
   * products - the sidebar that used to say so is behind a sheet now.
   * Search and sort are not filters and are visible in the bar anyway.
   */
  const activeFilterCount =
    (filters.category ? 1 : 0) +
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0);

  // A sheet you cannot dismiss is a trap.
  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [filtersOpen]);
  const shopPath = urlCategory ? `/shop?category=${urlCategory}` : '/shop';

  return (
    <Layout title="Shop">
      <Seo
        title={activeCategory ? activeCategory.name : 'Shop'}
        description={
          activeCategory
            ? `Buy ${activeCategory.name} online at ShopMaster Pro. Genuine products, secure checkout and fast delivery across India.`
            : 'Shop jewellery, fashion, footwear, electronics and more at ShopMaster Pro. Secure checkout and fast delivery across India.'
        }
        path={shopPath}
      />
      <div className="flex flex-col gap-4">
        {/*
          HEADER, built for a phone first.

          The whole of the first screen used to be chrome: a heading, a search
          box, a sort box, a line of explainer text, and a 330px filter card -
          the first product started below the fold. Nearly every visitor this
          shop is chasing arrives on a phone, and none of them saw a product
          without scrolling.

          Filters now live behind a button that opens a sheet, which is what a
          phone shopper expects, and the desktop sidebar is unchanged.
        */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-xl md:text-2xl font-bold">
              {activeCategory ? activeCategory.name : 'Shop'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {meta.total} product{meta.total === 1 ? '' : 's'}
              {meta.totalPages > 1 && ` · page ${meta.page} of ${meta.totalPages}`}
            </p>
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <input
              type="search"
              placeholder="Search products"
              aria-label="Search products"
              value={filters.search}
              onChange={handleSearchChange}
              /* min-w-0: an input carries an intrinsic minimum width, and a
                 flex item will not shrink below it. Without this the search
                 box refused to give way and pushed the whole row - and so the
                 page - wider than the phone. */
              className="flex-1 min-w-0 md:w-56 border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600"
            />

            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              aria-label="Sort products"
              className="shrink-0 border border-gray-300 rounded-lg px-2 md:px-3 py-2 text-sm w-28 sm:w-44
                         focus:outline focus:outline-2 focus:outline-offset-0 focus:outline-orange-600"
            >
              <option value="newest">Newest</option>
              <option value="price_low_high">Price: low to high</option>
              <option value="price_high_low">Price: high to low</option>
              <option value="name_asc">Name: A to Z</option>
            </select>

            {/* Phones only - the sidebar is already there on a wider screen. */}
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="md:hidden shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm
                         border border-gray-300 hover:bg-gray-50
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-5 h-5 px-1.5 rounded-full bg-orange-600 text-white text-xs
                                 inline-flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-6">
          {/* LEFT FILTERS - desktop only; the phone gets the sheet below. */}
          <div className="hidden md:block">
            <FilterSidebar
              filters={filters}
              onChange={handleFilterChange}
              onClear={handleClearFilters}
              categories={categories}
            />
          </div>

          {/* RIGHT PRODUCTS AREA */}
          <div className="flex flex-col gap-4">
            {loading && (
              <div className="mt-8">
                <Loader />
              </div>
            )}

            {!loading && sortedProducts.length === 0 && (
              <div className="bg-white rounded-xl shadow p-8 text-center text-sm text-gray-600">
                No products match your filters. Try adjusting filters or search.
              </div>
            )}

            {!loading && sortedProducts.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sortedProducts.map((product) => (
  <ProductCard key={product._id} product={product} />
))}

                </div>

                {/* Pagination */}
                <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                  <button
                    onClick={() => handlePageChange('prev')}
                    disabled={meta.page <= 1}
                    className="px-3 py-1 border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                  >
                    ← Previous
                  </button>
                  <span className="text-gray-600">
                    Page {meta.page} of {meta.totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange('next')}
                    disabled={meta.page >= meta.totalPages}
                    className="px-3 py-1 border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/*
        FILTER SHEET (phones)

        Slides up from the bottom, which is where a thumb is. Escape and the
        backdrop both close it, and it never renders on a wider screen where
        the sidebar already does this job.
      */}
      {filtersOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto
                          bg-white rounded-t-2xl shadow-xl">
            <div className="sticky top-0 flex items-center justify-between gap-3
                            px-4 py-3 bg-white border-b border-gray-100">
              <h3 className="font-semibold">Filters</h3>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
                className="p-2 -mr-2 rounded-lg text-gray-500 hover:text-gray-800
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4">
              <FilterSidebar
                bare
                filters={filters}
                onChange={handleFilterChange}
                onClear={handleClearFilters}
                categories={categories}
              />
            </div>

            {/* The way out, where the thumb already is. */}
            <div className="sticky bottom-0 p-4 bg-white border-t border-gray-100">
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="w-full py-2.5 rounded-lg bg-orange-600 text-white font-medium
                           hover:bg-orange-700
                           focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
              >
                Show {meta.total} product{meta.total === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
