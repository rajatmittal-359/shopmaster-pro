// src/pages/auth/VerifyOTP.jsx
import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { verifyOtpThunk, clearError } from '../../redux/slices/authSlice';
import { useNavigate } from 'react-router-dom';

export default function VerifyOTP() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error, tempEmail } = useSelector((state) => state.auth);

  const [otp, setOtp] = useState('');

  useEffect(() => {
    if (!tempEmail) {
      navigate('/register');
    }
  }, [tempEmail, navigate]);

  const handleChange = (e) => {
    setOtp(e.target.value);
    if (error) dispatch(clearError());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await dispatch(verifyOtpThunk({ email: tempEmail, otp }));

    if (verifyOtpThunk.fulfilled.match(result)) {
      const role = result.payload.role;
      if (role === 'customer') navigate('/customer/dashboard');
      else if (role === 'seller') navigate('/seller/dashboard');
      else if (role === 'admin') navigate('/admin/dashboard');
      else navigate('/');
    }
  };

  if (!tempEmail) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4 text-center text-orange-600">
          Verify OTP
        </h2>

        <p className="text-sm text-gray-600 mb-3 text-center">
          OTP sent to <span className="font-medium">{tempEmail}</span>
        </p>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Enter OTP</label>
            <input
              type="text"
              value={otp}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 tracking-widest text-center"
              maxLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 rounded transition disabled:opacity-60"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  );
}
