import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import api from '../../utils/api';
import {toastSuccess,toastError} from '../../utils/toast'
export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
  name: '',
  description: '',
  parentCategory: '', // empty = main category
});


  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/categories');
      setCategories(res.data.categories || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.post('/admin/categories', {
  name: form.name,
  description: form.description,
  parentCategory: form.parentCategory || null, // '' => null
});
setForm({ name: '', description: '', parentCategory: '' });

      loadCategories();
      toastSuccess('Category created successfully');
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (cat) => {
    try {
      await api.patch(`/admin/categories/${cat._id}`, {
        isActive: !cat.isActive,
        name: cat.name,
        description: cat.description,
      });
      loadCategories();
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed');
    }
  };

  const handleDelete = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"?`)) return;
    try {
      await api.delete(`/admin/categories/${cat._id}`);
      loadCategories();
      toastSuccess('Deleted');
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed');
    }
  };

  return (
    <Layout title="Manage Categories">
      <h2 className="text-2xl font-bold mb-4">Manage Categories</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="text-lg font-semibold mb-3">Add Category</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Name</label>
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
                rows={3}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
                        <div>
              <label className="block text-sm mb-1">
                Parent Category (optional)
              </label>
              <select
                name="parentCategory"
                value={form.parentCategory}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">Main category</option>
                {categories
                  .filter((c) => !c.parentCategory) // sirf main
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Main category banane ke liye upar wala option chhodo.
                Subcategory ke liye parent select karo.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-orange-500 text-white py-2 rounded hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Add Category'}
            </button>
          </form>
        </div>

        <div className="bg-white p-4 rounded shadow md:col-span-2">
          <h3 className="text-lg font-semibold mb-3">Categories</h3>
          {loading && <p>Loading...</p>}
          {!loading && categories.length === 0 && <p>No categories yet.</p>}
          {!loading && categories.length > 0 && (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div key={cat._id} className="flex justify-between items-center border rounded px-3 py-2">
                  <div>
                    <p className="font-semibold">{cat.name}</p>
                    {cat.description && <p className="text-xs text-gray-600">{cat.description}</p>}
                    <p className="text-xs text-gray-500 mt-1">
                      Status: <span className={cat.isActive ? 'text-green-600' : 'text-red-600'}>{cat.isActive ? 'Active' : 'Inactive'}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleActive(cat)} className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                      {cat.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => handleDelete(cat)} className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
