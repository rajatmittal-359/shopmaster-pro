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

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    stock: "",
    lowStockThreshold: 10,
    images: [], // only NEW uploads (base64)
    brand: "",
    sku: "",
    mrp: "",
    tags: "",
    weight: "", // NEW: for shipping
  });

  const [existingImages, setExistingImages] = useState([]); // URLs already on product
  const [errors, setErrors] = useState({});

  const navigate = useNavigate();
  const formRef = useRef(null);

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
      setProducts(prodRes.data.products);
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
      temp.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
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
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    const maxSize = 5 * 1024 * 1024;

    files.forEach((file) => {
      if (file.size > maxSize) {
        toastError(`${file.name} is too large (max 5MB).`);
        return;
      }
      if (!file.type.startsWith("image/")) {
        toastError(`${file.name} is not an image.`);
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((prev) => ({
          ...prev,
          images: [...prev.images, reader.result],
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeNewImage = (idx) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== idx),
    }));
  };

  const removeExistingImage = (idx) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const validateForm = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.category) errs.category = "Category is required";
    if (!form.price || Number(form.price) <= 0)
      errs.price = "Selling price must be > 0";
    if (!form.stock || Number(form.stock) < 0)
      errs.stock = "Stock must be 0 or more";
    if (form.weight && Number(form.weight) <= 0)
      errs.weight = "Weight must be > 0 kg";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const payload = {
        ...form,
        // tags: string → array
        tags: form.tags
          ? form.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        images: [...existingImages, ...form.images],
        weight: form.weight ? Number(form.weight) : undefined,
        price: Number(form.price),
        stock: Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold || 10),
        mrp: form.mrp ? Number(form.mrp) : undefined,
      };

      if (editingId) {
        await updateProduct(editingId, payload);
        toastSuccess("Product updated");
      } else {
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
    setEditingId(prod.id);
    setExistingImages(prod.images || []);
    setForm({
      name: prod.name || "",
      description: prod.description || "",
      category: prod.category?.id || "",
      price: prod.price ?? "",
      stock: prod.stock ?? "",
      lowStockThreshold: prod.lowStockThreshold ?? 10,
      images: [],
      brand: prod.brand || "",
      sku: prod.sku || "",
      mrp: prod.mrp ?? "",
      tags: (prod.tags || []).join(", "),
      weight: prod.weight ?? "",
    });
    setErrors({});
    setShowForm(true);
    setTimeout(
      () =>
        formRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      100
    );
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
      lowStockThreshold: 10,
      images: [],
      brand: "",
      sku: "",
      mrp: "",
      tags: "",
      weight: "",
    });
    setExistingImages([]);
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
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">My Products</h2>
        <button
          onClick={() => {
            const next = !showForm;
            setShowForm(next);
            if (!next) resetForm();
            else
              setTimeout(
                () =>
                  formRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  }),
                100
              );
          }}
          className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded text-sm font-semibold"
        >
          {showForm ? "Close Form" : "Add Product"}
        </button>
      </div>

      {/* Search + Sort */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <input
          placeholder="Search by name, brand, SKU or tag..."
          className="border px-3 py-2 rounded text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border px-3 py-2 rounded text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="priceLow">Price Low to High</option>
          <option value="priceHigh">Price High to Low</option>
          <option value="stockLow">Stock Low to High</option>
        </select>
      </div>

      {/* FORM */}
      {showForm && (
        <div
          ref={formRef}
          className="bg-white rounded shadow p-4 mb-6 border"
        >
          <h3 className="text-lg font-semibold mb-3">
            {editingId ? "Edit Product" : "Add Product"}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm mb-1">
                Product Name
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="e.g. Traditional Gold Plated Bridal Necklace Set"
              />
              {errors.name && (
                <p className="text-xs text-red-500 mt-1">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm mb-1">
                Description
              </label>
              <textarea
                name="description"
                rows={4}
                value={form.description}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="Describe the product, materials, usage, etc."
              />
              <p className="text-xs text-gray-500 mt-1">
                You can add bullet style points using new lines.
              </p>
            </div>

            {/* Category, Brand, SKU */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1">
                  Category
                </label>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">Select category</option>
                  {categories.map((c) => (
                    <option key={c._id || c.id} value={c._id || c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.category}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Brand (optional)
                </label>
                <input
                  name="brand"
                  value={form.brand}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. Charmora"
                />
              </div>

              <div>
                <label className="block text-sm mb-1">
                  SKU (optional)
                </label>
                <input
                  name="sku"
                  value={form.sku}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Internal code"
                />
              </div>
            </div>

            {/* Pricing / Stock / Weight */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm mb-1">
                  MRP (₹, optional)
                </label>
                <input
                  type="number"
                  name="mrp"
                  value={form.mrp}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. 5990"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Shown as original price to highlight discount.
                </p>
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Selling Price (₹)
                </label>
                <input
                  type="number"
                  name="price"
                  value={form.price}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Customer will pay this amount"
                  min="0"
                />
                {errors.price && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.price}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Stock (qty)
                </label>
                <input
                  type="number"
                  name="stock"
                  value={form.stock}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. 50"
                  min="0"
                />
                {errors.stock && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.stock}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="weight"
                  value={form.weight}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. 0.50"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used for shipping charge via Shiprocket. Leave blank
                  to use default 0.5 kg per item.
                </p>
                {errors.weight && (
                  <p className="text-xs text-red-500 mt-1">
                    {errors.weight}
                  </p>
                )}
              </div>
            </div>

            {/* Low stock + Tags */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">
                  Low Stock Alert Threshold
                </label>
                <input
                  type="number"
                  name="lowStockThreshold"
                  value={form.lowStockThreshold}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. 10"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  When stock goes below this, low‑stock warning
                  appears.
                </p>
              </div>

              <div>
                <label className="block text-sm mb-1">
                  Tags (comma separated)
                </label>
                <input
                  name="tags"
                  value={form.tags}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. necklace, bridal, gold plated"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Helps customers find the product in search.
                </p>
              </div>
            </div>

            {/* Images */}
            <div>
              <p className="text-sm font-medium mb-1">
                Existing images
              </p>
              {existingImages.length === 0 && (
                <p className="text-xs text-gray-500">
                  No images uploaded yet.
                </p>
              )}
              <div className="flex flex-wrap gap-2 mb-2">
                {existingImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="w-16 h-16 rounded overflow-hidden border relative"
                  >
                    <img
                      src={img}
                      alt="existing"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(idx)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mb-1">
                Upload new images if you want to add more or replace
                existing.
              </p>
              <input
                type="file"
                multiple
                onChange={handleImageChange}
                className="text-sm"
              />
              {form.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.images.map((img, idx) => (
                    <div
                      key={idx}
                      className="w-16 h-16 rounded overflow-hidden border relative"
                    >
                      <img
                        src={img}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeNewImage(idx)}
                        className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center"
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
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded text-sm font-semibold"
            >
              {editingId ? "Update Product" : "Add Product"}
            </button>
          </form>
        </div>
      )}

      {/* Empty state */}
      {!filtered.length && (
        <div className="bg-white rounded shadow p-8 text-center text-sm text-gray-600">
          No products found. Try changing search or filters.
        </div>
      )}

      {/* Products grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((prod) => (
            <div
              key={prod.id}
              className="border rounded-lg shadow-sm bg-white flex flex-col"
            >
              {prod.images?.length > 0 && (
                <div className="h-56 w-full">
                  <Swiper
                    modules={[Navigation, Pagination]}
                    navigation
                    pagination={{ clickable: true }}
                    className="h-full"
                    slidesPerView={1}
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
                    {prod.mrp && (
                      <span className="text-xs line-through text-gray-400">
                        ₹{prod.mrp}
                      </span>
                    )}
                    <span className="font-bold text-orange-600">
                      ₹{prod.price}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold">
                      {prod.stock}
                    </span>
                    {typeof prod.lowStockThreshold === "number" &&
                      prod.stock <= prod.lowStockThreshold && (
                        <span className="ml-1 text-xs text-red-600">
                          Low stock
                        </span>
                      )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between border-t px-4 py-2 text-xs">
                <button
                  onClick={() => handleEdit(prod)}
                  className="px-3 py-1 border border-blue-500 text-blue-600 rounded hover:bg-blue-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(prod.id)}
                  className="px-3 py-1 border border-red-500 text-red-600 rounded hover:bg-red-50"
                >
                  Delete
                </button>
                <button
                  onClick={() =>
                    navigate(`/seller/products/${prod.id}`)
                  }
                  className="px-3 py-1 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                >
                  View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
