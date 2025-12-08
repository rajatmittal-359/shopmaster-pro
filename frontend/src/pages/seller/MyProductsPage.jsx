import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import {
  getMyProducts,
  addProduct,
  updateProduct,
  deleteProduct,
} from '../../services/sellerService';
import { getCategories } from '../../services/productService';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import { toastSuccess, toastError } from '../../utils/toast';

export default function MyProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    price: '',
    stock: '',
    lowStockThreshold: '10',
    images: [],
  });

  useEffect(() => {
    loadData();
  }, []);

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
      console.error(err);
    } finally {
      setLoading(false);
    }
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
      toastSuccess('Product updated');
    } else {
      await addProduct(form);
      toastSuccess('Product created');
    }
    resetForm();
    await loadData();
  } catch (err) {
    toastError(err?.response?.data?.message || 'Error saving product');
  }
};


  const handleEdit = (prod) => {
    setEditingId(prod._id);
    setForm({
      name: prod.name,
      description: prod.description,
      category: prod.category?._id || '',
      price: prod.price,
      stock: prod.stock,
      lowStockThreshold: prod.lowStockThreshold || '10',
      images: prod.images || [],
    });
    setShowForm(true);
  };

const handleDelete = async (id) => {
  if (!window.confirm('Delete this product?')) return;
  try {
    await deleteProduct(id);
    toastSuccess('Product deleted');
    loadData();
  } catch (err) {
    toastError(err?.response?.data?.message || 'Error deleting product');
  }
};



  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      category: '',
      price: '',
      stock: '',
      lowStockThreshold: '10',
      images: [],
    });
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <Layout title="My Products">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">My Products</h2>
        <button
          onClick={() => setShowForm((p) => !p)}
          className="px-5 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"
        >
          {showForm ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {/* ------------ PRODUCT FORM ------------- */}
      {showForm && (
        <div className="bg-white p-5 rounded shadow mb-8">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Product' : 'Add New Product'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Product Name"
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />

            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={4}
              placeholder="Product Description"
              required
              className="w-full border rounded px-3 py-2 text-sm"
            />

            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              required
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">Select category</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>
                  {cat.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                name="price"
                value={form.price}
                onChange={handleChange}
                placeholder="Price"
                required
                className="w-full border rounded px-3 py-2 text-sm"
              />
              <input
                type="number"
                name="stock"
                value={form.stock}
                onChange={handleChange}
                placeholder="Stock"
                required
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <input
              type="number"
              name="lowStockThreshold"
              value={form.lowStockThreshold}
              onChange={handleChange}
              placeholder="Low Stock Alert"
              className="w-full border rounded px-3 py-2 text-sm"
            />

            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="w-full text-sm"
            />

            {form.images.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {form.images.map((img, index) => (
                  <div key={index} className="relative">
                    <img
                      src={img}
                      className="w-full h-20 object-cover rounded border"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 bg-red-600 text-white text-xs px-1 rounded"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-orange-500 text-white py-2 rounded text-sm hover:bg-orange-600"
            >
              {editingId ? 'Update Product' : 'Add Product'}
            </button>
          </form>
        </div>
      )}

      {/* ------------ PRODUCT GRID ------------- */}
      {loading && <p>Loading...</p>}

      {!loading && products.length === 0 && (
        <p className="text-sm text-gray-600">No products yet.</p>
      )}

      {!loading && products.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((prod) => (
<div
  key={prod._id}
  className="bg-white rounded-xl shadow hover:shadow-xl transition overflow-hidden border"
>
  {/* IMAGE SLIDER */}
  {prod.images?.length > 0 && (
    <Swiper
      modules={[Navigation, Pagination]}
      navigation
      pagination={{ clickable: true }}
      slidesPerView={1}
      className="w-full h-48"
    >
      {prod.images.map((img, i) => (
        <SwiperSlide key={i}>
          <img
            src={img}
            alt={prod.name}
            className="w-full h-48 object-cover"
          />
        </SwiperSlide>
      ))}
    </Swiper>
  )}

  {/* CONTENT */}
  <div className="p-4 space-y-2">

    {/* PRODUCT NAME */}
    <h3 className="font-semibold text-base line-clamp-1">
      {prod.name}
    </h3>

    {/* CATEGORY */}
    <p className="text-xs text-gray-500">
      Category: {prod.category?.name}
    </p>

    {/* DESCRIPTION */}
    <div
      className="text-sm text-gray-600 line-clamp-2"
      dangerouslySetInnerHTML={{
        __html: prod.description,
      }}
    />

    {/* PRICE + STOCK ROW */}
    <div className="flex justify-between items-center pt-2">
      <span className="text-lg font-bold text-orange-600">
        ₹{prod.price}
      </span>

      <span className={`text-xs font-medium ${
        prod.stock <= prod.lowStockThreshold
          ? 'text-red-600'
          : 'text-green-600'
      }`}>
        Stock: {prod.stock}
      </span>
    </div>

    {/* ACTION BUTTONS */}
    <div className="flex gap-2 pt-3">
      <button
        onClick={() => handleEdit(prod)}
        className="flex-1 border border-blue-500 text-blue-600 py-1.5 rounded hover:bg-blue-50 text-sm"
      >
        Edit
      </button>

      <button
        onClick={() => handleDelete(prod._id)}
        className="flex-1 border border-red-500 text-red-600 py-1.5 rounded hover:bg-red-50 text-sm"
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
