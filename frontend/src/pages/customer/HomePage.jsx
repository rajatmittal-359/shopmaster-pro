// frontend/src/pages/customer/HomePage.jsx
import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import ProductCard from '../../components/customer/ProductCard';
import FilterSidebar from '../../components/customer/FilterSidebar';
import { getProducts, getCategories } from '../../services/productService';
import Loader from '../../components/common/Loader';

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState({
    page: 1,
    totalPages: 1,
    total: 0,
  });

  const [filters, setFilters] = useState({
    search: '',
    category: '',
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
  };

  const handleClearFilters = () => {
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
        return copy.sort((a, b) => a.price - b.price);
      case 'price_high_low':
        return copy.sort((a, b) => b.price - a.price);
      case 'name_asc':
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      case 'newest':
      default:
        return copy; // already newest from backend
    }
  };

  const sortedProducts = getSortedProducts();

  return (
    <Layout title="Shop">
      <div className="flex flex-col gap-4">
        {/* Header row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Shop</h2>
            <p className="text-xs text-gray-500 mt-1">
              Showing page {meta.page} of {meta.totalPages} • {meta.total} product
              {meta.total === 1 ? '' : 's'}
            </p>
          </div>

          {/* Top search + sort */}
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <input
              type="text"
              placeholder="Search products..."
              value={filters.search}
              onChange={handleSearchChange}
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="border rounded px-3 py-2 text-sm w-full sm:w-48"
            >
              <option value="newest">Sort: Newest</option>
              <option value="price_low_high">Price: Low to High</option>
              <option value="price_high_low">Price: High to Low</option>
              <option value="name_asc">Name: A → Z</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-6">
          {/* LEFT FILTERS */}
          <FilterSidebar
            filters={filters}
            onChange={handleFilterChange}
            onClear={handleClearFilters}
            categories={categories}
          />

          {/* RIGHT PRODUCTS AREA */}
          <div className="flex flex-col gap-4">
            {loading && (
              <div className="mt-8">
                <Loader />
              </div>
            )}

            {!loading && sortedProducts.length === 0 && (
              <div className="bg-white rounded shadow p-8 text-center text-sm text-gray-600">
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
                    className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50"
                  >
                    ← Previous
                  </button>
                  <span className="text-gray-600">
                    Page {meta.page} of {meta.totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange('next')}
                    disabled={meta.page >= meta.totalPages}
                    className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
