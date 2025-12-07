// frontend/src/components/customer/FilterSidebar.jsx
export default function FilterSidebar({
  filters,
  onChange,
  onClear,
  categories,
}) {
  const handleInput = (e) => {
    const { name, value } = e.target;
    onChange(name, value);
  };

  return (
    <aside className="bg-white rounded-lg shadow-sm p-4 h-fit border">
      <h3 className="text-sm font-semibold mb-3">Filters</h3>

      {/* Category */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Category
        </label>
        <select
          name="category"
          value={filters.category}
          onChange={handleInput}
          className="w-full border rounded px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat._id} value={cat._id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Price range */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Price Range (₹)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            name="minPrice"
            value={filters.minPrice}
            onChange={handleInput}
            placeholder="Min"
            min="0"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="number"
            name="maxPrice"
            value={filters.maxPrice}
            onChange={handleInput}
            placeholder="Max"
            min="0"
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onClear}
        className="w-full mt-1 text-xs px-3 py-2 rounded border border-gray-300 hover:bg-gray-50"
      >
        Clear filters
      </button>
    </aside>
  );
}
