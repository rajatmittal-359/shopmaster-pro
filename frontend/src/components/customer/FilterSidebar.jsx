// frontend/src/components/customer/FilterSidebar.jsx
import { useState, useEffect } from 'react';

export default function FilterSidebar({
  filters,
  onChange,
  onClear,
  categories,
}) {
  const [selectedMain, setSelectedMain] = useState('');
  const [selectedSub, setSelectedSub] = useState('');

  const mainCategories = categories.filter((c) => !c.parentCategory);
  
  // ✅ FIXED: Sort by displayOrder
const subCategories = selectedMain
  ? categories
      .filter((c) => {
        const parentId = c.parentCategory?._id || c.parentCategory;
        return parentId === selectedMain;
      })
      .sort((a, b) => (a.displayOrder || 999) - (b.displayOrder || 999))
  : [];

console.log(
  'JEWELLERY SUBS =>',
  subCategories.map((c) => ({ name: c.name, displayOrder: c.displayOrder }))
);


  useEffect(() => {
    if (!filters.category) {
      setSelectedMain('');
      setSelectedSub('');
    } else {
      const selectedCategory = categories.find((c) => c._id === filters.category);
      if (selectedCategory) {
        if (selectedCategory.parentCategory) {
          const parentId = selectedCategory.parentCategory._id || selectedCategory.parentCategory;
          setSelectedMain(parentId);
          setSelectedSub(filters.category);
        } else {
          setSelectedMain(filters.category);
          setSelectedSub('');
        }
      }
    }
  }, [filters.category, categories]);

  const handleInput = (e) => {
    const { name, value } = e.target;
    onChange(name, value);
  };

  const handleMainChange = (e) => {
    const value = e.target.value;
    setSelectedMain(value);
    setSelectedSub('');
    onChange('category', value);
  };

  const handleSubChange = (e) => {
    const value = e.target.value;
    setSelectedSub(value);
    onChange('category', value || selectedMain);
  };

  const handleClear = () => {
    setSelectedMain('');
    setSelectedSub('');
    onClear();
  };

  return (
    <aside className="bg-white rounded-lg shadow-sm p-4 h-fit border">
      <h3 className="text-sm font-semibold mb-3">Filters</h3>

      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Main Category
        </label>
        <select
          value={selectedMain}
          onChange={handleMainChange}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        >
          <option value="">All Categories</option>
          {mainCategories.map((cat) => (
            <option key={cat._id} value={cat._id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
          Sub Category (optional)
        </label>
        <select
          value={selectedSub}
          onChange={handleSubChange}
          disabled={!selectedMain || subCategories.length === 0}
          className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
            !selectedMain || subCategories.length === 0
              ? 'bg-gray-100 cursor-not-allowed text-gray-500'
              : 'border-gray-300'
          }`}
        >
          <option value="">
            {!selectedMain 
              ? '-- Select Main Category First --' 
              : subCategories.length === 0
              ? '-- No Subcategories --'
              : 'All from this Main Category'}
          </option>
          {subCategories.map((cat) => (
            <option key={cat._id} value={cat._id}>
              {cat.name}
            </option>
          ))}
        </select>
        {selectedMain && subCategories.length > 0 && (
          <p className="text-[11px] text-gray-500 mt-1">
            Optional: Narrow down to specific subcategory
          </p>
        )}
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1.5">
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
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
          <input
            type="number"
            name="maxPrice"
            value={filters.maxPrice}
            onChange={handleInput}
            placeholder="Max"
            min="0"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>
      </div>

      {(filters.category || filters.minPrice || filters.maxPrice) && (
        <div className="mb-3 p-2 bg-orange-50 border border-orange-200 rounded-md">
          <p className="text-[11px] text-orange-800 font-medium">
            ✓ Filters applied
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleClear}
        className="w-full text-xs px-3 py-2.5 rounded-md border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-colors font-medium text-gray-700"
      >
        Clear All Filters
      </button>
    </aside>
  );
}
