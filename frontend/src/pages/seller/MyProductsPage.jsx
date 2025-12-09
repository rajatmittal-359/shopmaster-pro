import { useEffect, useState } from "react";
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

  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    price: "",
    stock: "",
    lowStockThreshold: "10",
    images: [],
  });

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

    if (search) {
      temp = temp.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.category?.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (sort === "newest") {
      temp.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    if (sort === "priceLow") {
      temp.sort((a, b) => a.price - b.price);
    }
    if (sort === "priceHigh") {
      temp.sort((a, b) => b.price - a.price);
    }
    if (sort === "stockLow") {
      temp.sort((a, b) => a.stock - b.stock);
    }

    setFiltered(temp);
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);

    files.forEach((file) => {
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

  const removeImage = (index) => {
    setForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateProduct(editingId, form);
        toastSuccess("Product updated");
      } else {
        await addProduct(form);
        toastSuccess("Product created");
      }
      resetForm();
      await loadData();
    } catch (err) {
      toastError(err?.response?.data?.message || "Error saving product");
    }
  };

  const handleEdit = (prod) => {
    setEditingId(prod._id);
    setForm({
      name: prod.name,
      description: prod.description,
      category: prod.category?._id || "",
      price: prod.price,
      stock: prod.stock,
      lowStockThreshold: prod.lowStockThreshold || "10",
      images: prod.images || [],
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      await deleteProduct(id);
      toastSuccess("Product deleted");
      loadData();
    } catch (err) {
      toastError(err?.response?.data?.message || "Delete failed");
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
    });
    setEditingId(null);
    setShowForm(false);
  };

  const renderBullets = (text) => {
    return (
      <ul className="list-disc ml-4 space-y-1">
        {text.split("\n").map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    );
  };

  return (
    <Layout title="My Products">

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">My Products</h2>

        <button
          onClick={() => setShowForm((p) => !p)}
          className="px-5 py-2 bg-orange-500 text-white rounded"
        >
          {showForm ? "Cancel" : "+ Add Product"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <input
          placeholder="Search by name or category..."
          className="border px-3 py-2 rounded"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="border px-3 py-2 rounded"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest First</option>
          <option value="priceLow">Price: Low to High</option>
          <option value="priceHigh">Price: High to Low</option>
          <option value="stockLow">Low Stock First</option>
        </select>
      </div>

      {showForm && (
        <div className="bg-white p-5 rounded shadow mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Product Name"
              className="w-full border px-3 py-2 rounded"
              required
            />

            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Enter description (one point per line)"
              rows={5}
              className="w-full border px-3 py-2 rounded"
              required
            />

            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="w-full border px-3 py-2 rounded"
              required
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <input
                name="price"
                value={form.price}
                onChange={handleChange}
                placeholder="Price"
                type="number"
                className="border px-3 py-2 rounded"
                required
              />
              <input
                name="stock"
                value={form.stock}
                onChange={handleChange}
                placeholder="Stock"
                type="number"
                className="border px-3 py-2 rounded"
                required
              />
            </div>

            <input
              name="lowStockThreshold"
              value={form.lowStockThreshold}
              onChange={handleChange}
              placeholder="Low Stock Alert"
              type="number"
              className="border px-3 py-2 rounded"
            />

            <input type="file" multiple onChange={handleImageChange} />

            <button className="w-full bg-orange-500 text-white py-2 rounded">
              {editingId ? "Update Product" : "Add Product"}
            </button>
          </form>
        </div>
      )}

 
      {loading && <p>Loading...</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((prod) => (
          <div key={prod._id} className="border rounded shadow bg-white">
            {prod.images?.length > 0 && (
              <Swiper modules={[Navigation, Pagination]} navigation pagination>
                {prod.images.map((img, i) => (
                  <SwiperSlide key={i}>
                    <img src={img} className="w-full h-48 object-cover" />
                  </SwiperSlide>
                ))}
              </Swiper>
            )}

            <div className="p-4 space-y-2">
              <h3 className="font-bold">{prod.name}</h3>
              <p className="text-sm text-gray-500">
                Category: {prod.category?.name}
              </p>

              {renderBullets(prod.description)}

              <div className="flex justify-between pt-2">
                <span className="font-bold text-orange-600">₹{prod.price}</span>
                <span
                  className={`text-sm ${
                    prod.stock <= prod.lowStockThreshold
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  Stock: {prod.stock}
                </span>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  onClick={() => navigate(`/seller/products/${prod._id}`)}
                  className="flex-1 border border-orange-500 text-orange-600"
                >
                  View
                </button>
                <button
                  onClick={() => handleEdit(prod)}
                  className="flex-1 border border-blue-500 text-blue-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(prod._id)}
                  className="flex-1 border border-red-500 text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
