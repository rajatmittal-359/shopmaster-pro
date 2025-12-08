import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
} from '../../services/addressService';
import { toastSuccess, toastError } from '../../utils/toast';

export default function AddressesPage() {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    label: 'Home',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'India',
    isDefault: false,
  });

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    setLoading(true);
    try {
      const res = await getAddresses();
      setAddresses(res.data.addresses || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    if (editingId) {
      await updateAddress(editingId, form);
      toastSuccess('Address updated');
    } else {
      await addAddress(form);
      toastSuccess('Address added');
    }
    resetForm();
    loadAddresses();
  } catch (err) {
    toastError(err?.response?.data?.message || 'Error saving address');
  }
};

  const handleEdit = (addr) => {
    setEditingId(addr._id);
    setForm({
      label: addr.label,
      street: addr.street,
      city: addr.city,
      state: addr.state,
      zipCode: addr.zipCode,
      country: addr.country,
      isDefault: addr.isDefault,
    });
    setShowForm(true);
  };

const handleDelete = async (id) => {
  if (!window.confirm('Delete this address?')) return;
  try {
    await deleteAddress(id);
    toastSuccess('Address deleted');
    loadAddresses();
  } catch (err) {
    toastError(err?.response?.data?.message || 'Error deleting address');
  }
};


  const resetForm = () => {
    setForm({
      label: 'Home',
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'India',
      isDefault: false,
    });
    setEditingId(null);
    setShowForm(false);
  };

  return (
    <Layout title="My Addresses">
      <div className="max-w-4xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">My Addresses</h2>
          <button
            onClick={() => setShowForm((p) => !p)}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm"
          >
            {showForm ? 'Cancel' : '+ Add Address'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white p-4 rounded shadow mb-6">
            <h3 className="text-lg font-semibold mb-3">
              {editingId ? 'Edit Address' : 'Add New Address'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">Label</label>
                <select
                  name="label"
                  value={form.label}
                  onChange={handleChange}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="Home">Home</option>
                  <option value="Office">Office</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-1">Street</label>
                <input
                  type="text"
                  name="street"
                  value={form.street}
                  onChange={handleChange}
                  required
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">City</label>
                  <input
                    type="text"
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    required
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">State</label>
                  <input
                    type="text"
                    name="state"
                    value={form.state}
                    onChange={handleChange}
                    required
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Zip Code</label>
                  <input
                    type="text"
                    name="zipCode"
                    value={form.zipCode}
                    onChange={handleChange}
                    required
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Country</label>
                  <input
                    type="text"
                    name="country"
                    value={form.country}
                    onChange={handleChange}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isDefault"
                  checked={form.isDefault}
                  onChange={handleChange}
                />
                Set as default address
              </label>

              <button
                type="submit"
                className="w-full bg-orange-500 text-white py-2 rounded text-sm hover:bg-orange-600"
              >
                {editingId ? 'Update Address' : 'Add Address'}
              </button>
            </form>
          </div>
        )}

        {loading && <p>Loading...</p>}
        {!loading && addresses.length === 0 && (
          <p className="text-gray-500 text-sm">No addresses saved yet.</p>
        )}

        {!loading && addresses.length > 0 && (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <div
                key={addr._id}
                className="bg-white p-4 rounded shadow flex justify-between items-start"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{addr.label}</span>
                    {addr.isDefault && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{addr.street}</p>
                  <p className="text-sm text-gray-700">
                    {addr.city}, {addr.state} - {addr.zipCode}
                  </p>
                  <p className="text-xs text-gray-500">{addr.country}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(addr)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(addr._id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
