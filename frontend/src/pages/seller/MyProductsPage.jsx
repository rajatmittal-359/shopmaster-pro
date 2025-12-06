import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import {
getMyProducts,
addProduct,
updateProduct,
deleteProduct,
} from '../../services/sellerService';
import { getCategories } from '../../services/productService';

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
  image: '',
});


useEffect(() => {
loadData();
}, []);
const handleImageChange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onloadend = () => {
    setForm((prev) => ({ ...prev, image: reader.result }));
  };
  reader.readAsDataURL(file);
};

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

const handleSubmit = async (e) => {
e.preventDefault();
try {
if (editingId) {
await updateProduct(editingId, form);
} else {
await addProduct(form);
}
resetForm();
loadData();
} catch (err) {
alert(err.response?.data?.message || 'Error saving product');
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
});
setShowForm(true);
};

const handleDelete = async (id) => {
if (!window.confirm('Delete this product?')) return;
try {
await deleteProduct(id);
loadData();
} catch (err) {
alert(err.response?.data?.message || 'Error deleting product');
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
});
setEditingId(null);
setShowForm(false);
};

return (
<Layout title="My Products">
<div className="flex justify-between items-center mb-4">
<h2 className="text-2xl font-bold">My Products</h2>
<button
onClick={() => setShowForm((p) => !p)}
className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"
>
{showForm ? 'Cancel' : '+ Add Product'}
</button>
</div>
  {showForm && (
    <div className="bg-white p-4 rounded shadow mb-6">
      <h3 className="text-lg font-semibold mb-3">
        {editingId ? 'Edit Product' : 'Add New Product'}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm mb-1">Product Name</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            required
            rows={3}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Category</label>
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Price (₹)</label>
            <input
              type="number"
              name="price"
              value={form.price}
              onChange={handleChange}
              required
              min="0"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Stock</label>
            <input
              type="number"
              name="stock"
              value={form.stock}
              onChange={handleChange}
              required
              min="0"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1">Low Stock Threshold</label>
          <input
            type="number"
            name="lowStockThreshold"
            value={form.lowStockThreshold}
            onChange={handleChange}
            min="0"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
  <label className="block text-sm mb-1">Product Image</label>
  <input
    type="file"
    accept="image/*"
    onChange={handleImageChange}
    className="w-full text-sm"
  />
  {form.image && (
    <p className="text-xs text-green-600 mt-1">Image selected</p>
  )}
</div>
        <button
          type="submit"
          className="w-full bg-orange-500 text-white py-2 rounded text-sm hover:bg-orange-600"
        >
          {editingId ? 'Update Product' : 'Add Product'}
        </button>
      </form>
    </div>
  )}

  {loading && <p>Loading...</p>}
  {!loading && products.length === 0 && (
    <p className="text-sm text-gray-600">No products yet.</p>
  )}
  {!loading && products.length > 0 && (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((prod) => (
        <div
          key={prod._id}
          className="bg-white p-4 rounded shadow border"
        >
          <h3 className="font-semibold text-sm">{prod.name}</h3>
          <p className="text-xs text-gray-600 mt-1">
            {prod.description.slice(0, 80)}...
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Category: {prod.category?.name}
          </p>
          <div className="flex justify-between items-center mt-2 text-sm">
            <span className="font-semibold">₹{prod.price}</span>
            <span
              className={`text-xs ${
                prod.stock <= prod.lowStockThreshold
                  ? 'text-red-600'
                  : 'text-gray-600'
              }`}
            >
              Stock: {prod.stock}
            </span>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleEdit(prod)}
              className="flex-1 text-xs text-blue-600 hover:underline"
            >
              Edit
            </button>
            <button
              onClick={() => handleDelete(prod._id)}
              className="flex-1 text-xs text-red-600 hover:underline"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  )}
</Layout>
);
}