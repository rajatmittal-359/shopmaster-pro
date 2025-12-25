// src/pages/seller/MyProductsPage.jsx
import { useEffect, useState, useRef } from "react";
import Layout from "../../components/common/Layout";
import {
  getMyProducts,
  addProduct,
  updateProduct,
  deleteProduct,
} from "../../services/sellerService";
import { getCategories } from "../../services/productService";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { toastSuccess, toastError } from "../../utils/toast";
import { useNavigate } from "react-router-dom";

export default function MyProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filtered, setFiltered] = useState([]);

  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");

  // Two-level category selection
  const [selectedMainCategory, setSelectedMainCategory] = useState("");
  const [selectedSubCategory, setSelectedSubCategory] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    stock: "",
    lowStockThreshold: "10",
    images: [],
    brand: "",
    sku: "",
    mrp: "",
    tags: "",
    weight: "",
  });

  const [existingImages, setExistingImages] = useState([]);
  const [errors, setErrors] = useState({});

  const navigate = useNavigate();
  const formRef = useRef(null);

  // Separate main and sub categories
  const mainCategories = categories.filter((c) => !c.parentCategory);
  const subCategories = selectedMainCategory
    ? categories.filter((c) => {
        const parentId = c.parentCategory?._id || c.parentCategory;
        return parentId === selectedMainCategory;
      })
    : [];

  // ---------- LOAD DATA ----------
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applySearchAndSort();
  }, [search, sort, products]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [prodRes, catRes] = await Promise.all([
        getMyProducts(),
        getCategories(),
      ]);
      setProducts(prodRes.data.products || []);
      setCategories(catRes.data.categories || []);
    } catch (err) {
      toastError("Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  const applySearchAndSort = () => {
    let temp = [...products];

    if (search.trim()) {
      const q = search.toLowerCase();
      temp = temp.filter((p) => {
        const inName = p.name?.toLowerCase().includes(q);
        const inCat = p.category?.name?.toLowerCase().includes(q);
        const inBrand = p.brand?.toLowerCase().includes(q);
        const inSku = p.sku?.toLowerCase().includes(q);
        const inTags = (p.tags || []).some((t) =>
          t.toLowerCase().includes(q)
        );
        return inName || inCat || inBrand || inSku || inTags;
      });
    }

    if (sort === "newest") {
      temp.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "priceLow") {
      temp.sort((a, b) => a.price - b.price);
    } else if (sort === "priceHigh") {
      temp.sort((a, b) => b.price - a.price);
    } else if (sort === "stockLow") {
      temp.sort((a, b) => a.stock - b.stock);
    }

    setFiltered(temp);
  };

  // ---------- FORM HANDLERS ----------
  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleMainCategoryChange = (e) => {
    const value = e.target.value;
    setSelectedMainCategory(value);
    setSelectedSubCategory("");
    setForm((prev) => ({ ...prev, category: "" }));
  };

  const handleSubCategoryChange = (e) => {
    const value = e.target.value;
    setSelectedSubCategory(value);
    setForm((prev) => ({ ...prev, category: value }));
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 5 * 1024 * 1024;

    files.forEach((file) => {
      if (file.size > maxSize) {
        toastError(`${file.name} is too large (max 5MB)`);
        return;
      }
      if (!file.type.startsWith("image/")) {
        toastError(`${file.name} is not an image`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((prev) => ({
          ...prev,
          images: [...prev.images, reader.result],
        }));
      };
      reader.onerror = () => {
        toastError("Failed to read image");
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newErrors = {};
    if (!form.name.trim() || form.name.trim().length < 3) {
      newErrors.name = "Name must be at least 3 characters";
    }
    if (!form.description.trim() || form.description.trim().length < 10) {
      newErrors.description = "Description must be at least 10 characters";
    }
    if (!form.category) {
      newErrors.category = "Please select both main and sub category";
    }
    if (!form.price || Number(form.price) <= 0) {
      newErrors.price = "Price must be greater than 0";
    }
    if (form.stock === "" || Number(form.stock) < 0) {
      newErrors.stock = "Stock cannot be negative";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      // scalar fields
      const basePayload = {
        name: form.name,
        description: form.description,
        category: form.category,
        price: Number(form.price),
        stock: Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold || 10),
        brand: form.brand || undefined,
        sku: form.sku || undefined,
        mrp: form.mrp ? Number(form.mrp) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        tags: form.tags
          ? form.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      };

      // images - DO NOT TOUCH THIS LOGIC (CRITICAL)
      const cleanExisting = (existingImages || []).filter(
        (img) =>
          typeof img === "string" &&
          (img.startsWith("http://") || img.startsWith("https://"))
      );
      const cleanNew = (form.images || []).filter(
        (img) =>
          typeof img === "string" && img.startsWith("data:image/")
      );

      let payload = { ...basePayload };

      if (editingId) {
        const allImages = [...cleanExisting, ...cleanNew];
        if (allImages.length > 0) {
          payload.images = allImages;
        }
        await updateProduct(editingId, payload);
        toastSuccess("Product updated");
      } else {
        if (cleanNew.length > 0) {
          payload.images = cleanNew;
        }
        await addProduct(payload);
        toastSuccess("Product created");
      }

      resetForm();
      await loadData();
    } catch (err) {
      toastError(
        err?.response?.data?.message || "Error saving product"
      );
    }
  };

  const handleEdit = (prod) => {
    setEditingId(prod._id);
    setExistingImages(prod.images || []);

    // Set category dropdowns for edit
    const selectedCategory = categories.find((c) => c._id === prod.category?._id);
    if (selectedCategory) {
      if (selectedCategory.parentCategory) {
        // It's a subcategory
        const parentId = selectedCategory.parentCategory._id || selectedCategory.parentCategory;
        setSelectedMainCategory(parentId);
        setSelectedSubCategory(selectedCategory._id);
      } else {
        // It's a main category (edge case)
        setSelectedMainCategory(selectedCategory._id);
        setSelectedSubCategory("");
      }
    }

    setForm({
      name: prod.name,
      description: prod.description,
      category: prod.category?._id || "",
      price: prod.price,
      stock: prod.stock,
      lowStockThreshold: prod.lowStockThreshold || "10",
      images: [],
      brand: prod.brand || "",
      sku: prod.sku || "",
      mrp: prod.mrp || "",
      tags: (prod.tags || []).join(", "),
      weight: prod.weight || "",
    });
    setErrors({});
    setShowForm(true);

    setTimeout(() => {
      formRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      await deleteProduct(id);
      toastSuccess("Product deleted");
      loadData();
    } catch (err) {
      toastError(
        err?.response?.data?.message || "Delete failed"
      );
    }
  };

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      category: "",
      price: "",
      stock: "",
      lowStockThreshold: "10",
      images: [],
      brand: "",
      sku: "",
      mrp: "",
      tags: "",
      weight: "",
    });
    setExistingImages([]);
    setSelectedMainCategory("");
    setSelectedSubCategory("");
    setErrors({});
    setEditingId(null);
    setShowForm(false);
  };

  const renderBullets = (text = "") => (
    <ul className="list-disc ml-4 space-y-1 text-xs text-gray-600">
      {text.split("\n").map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );

  // ---------- RENDER ----------
  if (loading) {
    return (
      <Layout title="My Products">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="h-64 bg-gray-200 rounded" />
            <div className="h-64 bg-gray-200 rounded" />
            <div className="h-64 bg-gray-200 rounded" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="My Products">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">My Products</h2>

        <button
          onClick={() => {
            const next = !showForm;
            setShowForm(next);
            if (!next) {
              resetForm();
            } else {
              setTimeout(
                () =>
                  formRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  }),
                100
              );
            }
          }}
          className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-semibold transition-colors"
        >
          {showForm ? "Close Form" : "+ Add Product"}
        </button>
      </div>

      {/* Search + Sort */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <input
          placeholder="Search by name, brand, SKU or tag..."
          className="border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="priceLow">Price: Low to High</option>
          <option value="priceHigh">Price: High to Low</option>
          <option value="stockLow">Low Stock First</option>
        </select>
      </div>

      {/* Form */}
      {showForm && (
        <div ref={formRef} className="bg-white p-6 rounded-lg shadow-md mb-8 border border-gray-200">
          <h3 className="text-lg font-semibold mb-4 text-gray-800">
            {editingId ? "Edit Product" : "Add New Product"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Product Name *
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Men's Cotton Regular Fit T-Shirt"
                className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              {errors.name && (
                <p className="text-red-500 text-xs mt-1">{errors.name}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Product Description *
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Enter description (one point per line)"
                rows={5}
                className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              {errors.description && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.description}
                </p>
              )}
            </div>

            {/* Two-Level Category Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Main Category *
                </label>
                <select
                  value={selectedMainCategory}
                  onChange={handleMainCategoryChange}
                  className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="">-- Select Main Category --</option>
                  {mainCategories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Sub Category *
                </label>
                <select
                  value={selectedSubCategory}
                  onChange={handleSubCategoryChange}
                  disabled={!selectedMainCategory || subCategories.length === 0}
                  className={`w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                    !selectedMainCategory || subCategories.length === 0
                      ? "bg-gray-100 cursor-not-allowed text-gray-500"
                      : "border-gray-300"
                  }`}
                >
                  <option value="">
                    {!selectedMainCategory
                      ? "-- Select Main First --"
                      : subCategories.length === 0
                      ? "-- No Subcategories --"
                      : "-- Select Sub Category --"}
                  </option>
                  {subCategories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                {!selectedMainCategory && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Select main category first
                  </p>
                )}
              </div>
            </div>
            {errors.category && (
              <p className="text-red-500 text-xs -mt-2">{errors.category}</p>
            )}

            {/* Brand + SKU */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Brand (optional)
                </label>
                <input
                  name="brand"
                  value={form.brand}
                  onChange={handleChange}
                  placeholder="e.g. MetroLine"
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  SKU (optional)
                </label>
                <input
                  name="sku"
                  value={form.sku}
                  onChange={handleChange}
                  placeholder="Seller internal code"
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* MRP / Price / Stock / Weight */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  MRP (optional)
                </label>
                <input
                  name="mrp"
                  value={form.mrp}
                  onChange={handleChange}
                  placeholder="MRP"
                  type="number"
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Selling Price (₹) *
                </label>
                <input
                  name="price"
                  value={form.price}
                  onChange={handleChange}
                  placeholder="Price"
                  type="number"
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                {errors.price && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.price}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Stock (qty) *
                </label>
                <input
                  name="stock"
                  value={form.stock}
                  onChange={handleChange}
                  placeholder="Stock"
                  type="number"
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                {errors.stock && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.stock}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Weight (kg)
                </label>
                <input
                  name="weight"
                  value={form.weight}
                  onChange={handleChange}
                  placeholder="e.g. 0.5"
                  type="number"
                  step="0.1"
                  className="border border-gray-300 px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Low stock */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Low Stock Alert Threshold
              </label>
              <input
                name="lowStockThreshold"
                value={form.lowStockThreshold}
                onChange={handleChange}
                placeholder="10"
                type="number"
                className="border border-gray-300 px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tags (comma separated)
              </label>
              <input
                name="tags"
                value={form.tags}
                onChange={handleChange}
                placeholder="e.g. men,tshirt,cotton"
                className="border border-gray-300 px-3 py-2 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* Existing images - DO NOT TOUCH THIS SECTION */}
            {existingImages.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Existing Images
                </p>
                <div className="flex flex-wrap gap-2">
                  {existingImages.map((img, idx) => (
                    <div
                      key={idx}
                      className="w-20 h-20 rounded-md overflow-hidden border border-gray-300 relative"
                    >
                      <img
                        src={img}
                        alt="existing"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setExistingImages((prev) =>
                            prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New images - DO NOT TOUCH THIS SECTION */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                {editingId
                  ? "Upload New Images (add more or replace existing)"
                  : "Upload Product Images (multiple allowed)"}
              </label>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageChange}
                className="text-sm w-full"
              />

              {form.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="w-20 h-20 rounded-md overflow-hidden border border-gray-300 relative"
                    >
                      <img
                        src={img}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-md text-sm font-semibold transition-colors"
            >
              {editingId ? "Update Product" : "Add Product"}
            </button>
          </form>
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-8 text-center text-sm text-gray-600">
          No products found. Try changing search or filters.
        </div>
      )}

      {/* Products grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((prod) => (
            <div
              key={prod._id}
              className="border border-gray-200 rounded-lg shadow-sm bg-white flex flex-col hover:shadow-md transition-shadow"
            >
              {prod.images?.length > 0 && (
                <div className="h-56 w-full">
                  <Swiper
                    modules={[Navigation, Pagination]}
                    navigation
                    pagination={{ clickable: true }}
                    className="h-full"
                  >
                    {prod.images.map((img, i) => (
                      <SwiperSlide key={i}>
                        <img
                          src={img}
                          className="w-full h-56 object-contain bg-gray-50"
                          alt={prod.name}
                        />
                      </SwiperSlide>
                    ))}
                  </Swiper>
                </div>
              )}

              <div className="p-4 space-y-2 flex-1 flex flex-col">
                <h3 className="font-semibold text-sm line-clamp-2">
                  {prod.name}
                </h3>
                <p className="text-xs text-gray-500">
                  Category: {prod.category?.name || "Uncategorized"}
                </p>

                {renderBullets(prod.description)}

                <div className="flex justify-between items-center pt-2 text-sm">
                  <div className="space-x-1">
                    {prod.mrp && prod.mrp > prod.price && (
                      <span className="text-xs line-through text-gray-400">
                        ₹{prod.mrp}
                      </span>
                    )}
                    <span className="font-bold text-orange-600">
                      ₹{prod.price}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      prod.stock <= prod.lowStockThreshold
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    Stock: {prod.stock}
                  </span>
                </div>

                <div className="flex gap-2 pt-3 mt-auto">
                  <button
                    onClick={() =>
                      navigate(`/seller/products/${prod._id}`)
                    }
                    className="flex-1 border border-orange-500 text-orange-600 text-xs py-1.5 rounded hover:bg-orange-50 transition-colors font-medium"
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleEdit(prod)}
                    className="flex-1 border border-blue-500 text-blue-600 text-xs py-1.5 rounded hover:bg-blue-50 transition-colors font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(prod._id)}
                    className="flex-1 border border-red-500 text-red-600 text-xs py-1.5 rounded hover:bg-red-50 transition-colors font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
