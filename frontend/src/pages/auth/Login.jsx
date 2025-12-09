// src/pages/auth/Login.jsx
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { loginThunk, clearError } from '../../redux/slices/authSlice';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);

  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    if (error) dispatch(clearError());
  };

const handleSubmit = async (e) => {
  e.preventDefault();

  const result = await dispatch(loginThunk(form));
  console.log('login result:', result); // TEMP dekhne ke liye

if (loginThunk.fulfilled.match(result)) {
  const userRole = result.payload.role || result.payload.user?.role;

  if (userRole === 'customer') navigate('/customer/shop');
  else if (userRole === 'seller') navigate('/seller/dashboard');
  else if (userRole === 'admin') navigate('/admin/dashboard');
  else navigate('/');
}

  // Yahan koi setForm({ email: '', password: '' }) MAT rakho
};

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4 text-center text-orange-600">
          Login
        </h2>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded transition disabled:opacity-60"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          New user?{' '}
          <Link to="/register" className="text-orange-600 font-medium">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
