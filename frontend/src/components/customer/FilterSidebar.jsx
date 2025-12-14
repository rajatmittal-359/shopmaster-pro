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
  const mainCategories = categories.filter((c) => !c.parentCategory);
  const subcategoriesByParent = categories.reduce((acc, c) => {
    if (c.parentCategory) {
      const pid = c.parentCategory._id || c.parentCategory;
      if (!acc[pid]) acc[pid] = [];
      acc[pid].push(c);
    }
    return acc;
  }, {});

  return (
    <aside className="bg-white rounded-lg shadow-sm p-4 h-fit border">
      <h3 className="text-sm font-semibold mb-3">Filters</h3>

      {/* Category */}
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

          {mainCategories.map((main) => (
            <optgroup key={main._id} label={main.name}>
              {(subcategoriesByParent[main._id] || []).map((sub) => (
                <option key={sub._id} value={sub._id}>
                  {sub.name}
                </option>
              ))}

              {/* Agar is main ke koi sub nahi, to main khud hi selectable */}
              {!(subcategoriesByParent[main._id] || []).length && (
                <option value={main._id}>{main.name}</option>
              )}
            </optgroup>
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
            {filters.category && (
        <p className="mb-2 text-[12px] text-gray-800">
          Selected category filter applied.
        </p>
      )}

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
