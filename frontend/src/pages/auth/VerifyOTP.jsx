// src/pages/auth/VerifyOTP.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/authContext';
import { useNavigate } from 'react-router-dom';
import { resendOtp } from '../../services/authService';
import { toastSuccess, toastError } from '../../utils/toast';

export default function VerifyOTP() {
  const navigate = useNavigate();
  const { loading, error, tempEmail, verifyOtp, clearError } = useAuth();

  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);
  // Counts down so the button says why it is unavailable instead of just
  // being dead. The server enforces the same wait; this only explains it.
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!tempEmail) {
      navigate('/register');
    }
  }, [tempEmail, navigate]);

  const handleChange = (e) => {
    setOtp(e.target.value);
    if (error) clearError();
  };

  /** Where each role lands once their email is verified. */
  const HOME_FOR_ROLE = {
    customer: '/customer/dashboard',
    seller: '/seller/dashboard',
    admin: '/admin/dashboard',
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = await verifyOtp({ email: tempEmail, otp });
    if (!result.ok) return; // the message is already on screen

    navigate(HOME_FOR_ROLE[result.data.role] || '/');
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const { data } = await resendOtp(tempEmail);
      toastSuccess(data.message || 'A new code is on its way.');
      setCooldown(60);
    } catch (err) {
      const status = err?.response?.status;
      const wait = err?.response?.data?.retryAfterSeconds;
      if (status === 429 && wait) setCooldown(wait);
      toastError(err?.response?.data?.message || 'Could not send a new code');
    } finally {
      setResending(false);
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

        {/* The way out for anyone whose code never arrived. Without this, a
            mail that failed left the account registered, unverified, and
            impossible to register again. */}
        <div className="mt-4 text-center text-sm text-gray-600">
          Didn&apos;t get the code?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="text-orange-600 font-medium hover:underline disabled:text-gray-400 disabled:no-underline"
          >
            {resending
              ? 'Sending...'
              : cooldown > 0
              ? `Send again in ${cooldown}s`
              : 'Send a new one'}
          </button>
        </div>
      </div>
    </div>
  );
}
