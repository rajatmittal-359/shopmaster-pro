import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import {
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  lookupPincode,
} from '../../services/addressService';
import { toastSuccess, toastError } from '../../utils/toast';
import { validateAddress, serverMessage } from '../../utils/validate';

import { useConfirm } from '../../context/confirmContext';
export default function AddressesPage() {
  const confirm = useConfirm();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    label: 'Home',
    phoneNumber: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'India',
    isDefault: false,
  });

  /**
   * What the PIN code told us.
   *
   * `areas` are POST OFFICE names, not colony names - 302021 comes back as
   * "Heerapura, Vaishali Nagar" while a real address in it reads "Vidhyut
   * Nagar". So they are shown as a hint to confirm the code was typed right,
   * never as a dropdown to choose from: forcing a choice would make people
   * pick a wrong one.
   */
  const [pinInfo, setPinInfo] = useState(null);
  const [pinState, setPinState] = useState('idle'); // idle | looking | ok | notfound | unavailable

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
      toastError('Could not load your addresses');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fills city and state from the PIN code.
   *
   * The three outcomes are deliberately different. A code that does not exist
   * is the person's typo and is said plainly. A lookup that FAILS is ours, and
   * must not block them - city and state stay editable so the address can still
   * be saved. Only a success locks those two fields, because then they are
   * known facts and typing over them is how a parcel goes to the wrong city.
   */
  const fillFromPincode = async (code) => {
    setPinState('looking');
    try {
      const { data } = await lookupPincode(code);
      setPinInfo(data);
      setPinState('ok');
      setForm((prev) => ({ ...prev, city: data.city, state: data.state }));
      setErrors((prev) => ({ ...prev, city: undefined, state: undefined, zipCode: undefined }));
    } catch (err) {
      setPinInfo(null);
      setPinState(err?.response?.status === 404 ? 'notfound' : 'unavailable');
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Stop complaining about a field the moment it is being fixed.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));

    if (name === 'zipCode') {
      const digits = value.replace(/\D/g, '');
      // Six digits is the whole trigger - no button to press, and no request
      // fired at every keystroke on the way there.
      if (digits.length === 6) fillFromPincode(digits);
      else {
        setPinInfo(null);
        setPinState('idle');
      }
    }
  };

const handleSubmit = async (e) => {
  e.preventDefault();

  // A wrong PIN code or phone number is not a cosmetic problem here: it is
  // where the parcel goes and who the rider calls. Caught before the request,
  // and checked again by models/Address.
  const found = validateAddress(form);
  if (Object.keys(found).length) {
    setErrors(found);
    return;
  }
  setErrors({});

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
    toastError(serverMessage(err, 'Error saving address'));
  }
};

  const handleEdit = (addr) => {
    setEditingId(addr._id);
    // An address already saved has a city and state that were accepted once;
    // they stay editable until the PIN code is retyped and confirms them.
    setPinInfo(null);
    setPinState('idle');
    setForm({
      label: addr.label,
      phoneNumber: addr.phoneNumber,
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
  const sure = await confirm({
    title: 'Delete this address?',
    confirmLabel: 'Delete address',
  });
  if (!sure) return;
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
      phoneNumber: '',
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'India',
      isDefault: false,
    });
    setEditingId(null);
    setErrors({});
    setShowForm(false);
    // Or the next address opens showing the last one's PIN code result, and
    // its city and state locked to somewhere else entirely.
    setPinInfo(null);
    setPinState('idle');
  };

  return (
    <Layout title="My Addresses">
      <div className="max-w-4xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">My Addresses</h2>
          <button
            onClick={() => setShowForm((p) => !p)}
            className="px-4 py-2 bg-brand-fill text-on-brand rounded-lg hover:bg-brand-fill-hover text-sm"
          >
            {showForm ? 'Cancel' : '+ Add Address'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white p-4 rounded-lg shadow mb-6">
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
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="Home">Home</option>
                  <option value="Office">Office</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
  <label className="block text-sm mb-1">Phone Number *</label>
  <input
    type="tel"
    name="phoneNumber"
    value={form.phoneNumber}
    onChange={handleChange}
    required
    maxLength="10"
    placeholder="9876543210"
    className={`w-full border rounded-lg px-3 py-2 text-sm ${
      errors.phoneNumber ? 'border-red-400' : ''
    }`}
  />
  {errors.phoneNumber && <p className="mt-1 text-xs text-red-600">{errors.phoneNumber}</p>}
</div>

              <div>
                <label className="block text-sm mb-1">Street</label>
                <input
                  type="text"
                  name="street"
                  value={form.street}
                  onChange={handleChange}
                  required
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${
                    errors.street ? 'border-red-400' : ''
                  }`}
                />
                {errors.street && <p className="mt-1 text-xs text-red-600">{errors.street}</p>}
              </div>

              {/*
                The PIN code comes BEFORE city and state because it fills them.
                Asked afterwards, a person types a city, then a code that
                disagrees with it, and the courier gets an address that cannot
                exist - which is the commonest way a booking is rejected.
              */}
              <div>
                <label className="block text-sm mb-1">PIN Code *</label>
                <input
                  type="text"
                  name="zipCode"
                  maxLength="6"
                  inputMode="numeric"
                  placeholder="302019"
                  value={form.zipCode}
                  onChange={handleChange}
                  required
                  className={`w-full border rounded-lg px-3 py-2 text-sm ${
                    errors.zipCode || pinState === 'notfound' ? 'border-red-400' : ''
                  }`}
                />

                {pinState === 'looking' && (
                  <p className="mt-1 text-xs text-gray-500">Checking…</p>
                )}
                {pinState === 'ok' && pinInfo && (
                  <p className="mt-1 text-xs text-positive">
                    {pinInfo.city}, {pinInfo.state}
                    {/* A few names are enough to confirm the code was typed
                        right; a busy city returns a dozen and the hint stops
                        being readable. */}
                    {pinInfo.areas?.length
                      ? ` · covers ${pinInfo.areas.slice(0, 3).join(', ')}${
                          pinInfo.areas.length > 3
                            ? ` +${pinInfo.areas.length - 3} more`
                            : ''
                        }`
                      : ''}
                  </p>
                )}
                {pinState === 'notfound' && (
                  <p className="mt-1 text-xs text-red-600">
                    No such PIN code. Check the six digits.
                  </p>
                )}
                {pinState === 'unavailable' && (
                  <p className="mt-1 text-xs text-notice">
                    Could not check that PIN code — please fill in city and state
                    yourself.
                  </p>
                )}
                {errors.zipCode && <p className="mt-1 text-xs text-red-600">{errors.zipCode}</p>}
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
                    readOnly={pinState === 'ok'}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${
                      pinState === 'ok' ? 'bg-gray-100 text-gray-600' : ''
                    } ${errors.city ? 'border-red-400' : ''}`}
                  />
                  {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
                </div>
                <div>
                  <label className="block text-sm mb-1">State</label>
                  <input
                    type="text"
                    name="state"
                    value={form.state}
                    onChange={handleChange}
                    required
                    readOnly={pinState === 'ok'}
                    className={`w-full border rounded-lg px-3 py-2 text-sm ${
                      pinState === 'ok' ? 'bg-gray-100 text-gray-600' : ''
                    } ${errors.state ? 'border-red-400' : ''}`}
                  />
                  {errors.state && <p className="mt-1 text-xs text-red-600">{errors.state}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">Country</label>
                  <input
                    type="text"
                    name="country"
                    value={form.country}
                    onChange={handleChange}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
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
                className="w-full bg-brand-fill text-on-brand py-2 rounded-lg text-sm hover:bg-brand-fill-hover"
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
                className="bg-white p-4 rounded-lg shadow flex justify-between items-start"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{addr.label}</span>
                    {addr.isDefault && (
                      <span className="text-xs bg-positive-tint text-positive px-2 py-0.5 rounded-lg">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{addr.street}</p>
                  <p className="text-sm text-gray-600">📞 {addr.phoneNumber}</p>
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
