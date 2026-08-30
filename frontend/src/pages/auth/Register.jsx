// src/pages/auth/Register.jsx
import { useState } from 'react';
import { useAuth } from '../../context/authContext';
import { useNavigate, Link } from 'react-router-dom';
import { validateRegister } from '../../utils/validate';

export default function Register() {
  const navigate = useNavigate();
  const { loading, error, register, clearError, setTempEmail } = useAuth();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'customer',
    businessName: '',
  });

  // Only filled in when the form is submitted. Marking a field red while
  // someone is still typing their password tells them they are wrong before
  // they have finished being right.
  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear this field's complaint as soon as it is being addressed.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
    if (error) clearError();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Caught here so the answer is instant. The server checks all of this
    // again - see utils/validate.
    const found = validateRegister(form);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }
    setErrors({});

    const result = await register(form);
    if (!result.ok) return; // the message is already on screen

    // The OTP screen needs to know which address the code went to.
    setTempEmail(form.email);
    navigate('/verify-otp');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4 text-center text-orange-600">
          Create Account
        </h2>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.name ? 'border-red-400 focus:ring-red-400' : 'focus:ring-orange-400'
              }`}
              required
            />
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.email ? 'border-red-400 focus:ring-red-400' : 'focus:ring-orange-400'
              }`}
              required
            />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.password ? 'border-red-400 focus:ring-red-400' : 'focus:ring-orange-400'
              }`}
              required
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm mb-1">Role</label>
            <select
              name="role"
              value={form.role}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              <option value="customer">Customer</option>
              <option value="seller">Seller</option>
            </select>
          </div>

          {/* Business Name – only for seller */}
          {form.role === 'seller' && (
            <div>
              <label className="block text-sm mb-1">Business Name</label>
              <input
                type="text"
                name="businessName"
                value={form.businessName}
                onChange={handleChange}
                className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                  errors.businessName ? 'border-red-400 focus:ring-red-400' : 'focus:ring-orange-400'
                }`}
                required
              />
              {errors.businessName && <p className="mt-1 text-xs text-red-600">{errors.businessName}</p>}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded transition disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-orange-600 font-medium">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
