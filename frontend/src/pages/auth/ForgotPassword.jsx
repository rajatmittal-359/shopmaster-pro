import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';

import { forgotPassword } from '../../services/authService';

/**
 * "I forgot my password."
 *
 * There was no way to do this at all - forgetting a password locked you out
 * for good, because signing in was impossible and registering again is refused
 * for an address that is already taken.
 *
 * WHY THIS SCREEN NEVER SAYS "WE FOUND YOU"
 *   The server answers identically whether or not the address has an account,
 *   on purpose: any difference turns this into a way to test which emails are
 *   registered here, one at a time. So the confirmation below is careful to
 *   promise nothing - "if there is an account" - and the copy tells the person
 *   what to do when no mail arrives, since that is the case this screen cannot
 *   distinguish for them.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          'Could not send the link right now. Please try again in a minute.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6">
        {sent ? (
          <>
            <MailCheck className="text-brand-ink mb-3" size={28} />
            <h1 className="text-xl font-semibold text-gray-900">Check your email</h1>
            <p className="text-sm text-gray-600 mt-2">
              If there is an account for <b>{email.trim()}</b>, a link to choose
              a new password is on its way. It works for one hour.
            </p>
            <p className="text-sm text-gray-600 mt-3">
              Nothing arrived? Look in spam, then check the address above for a
              typo — we cannot tell you whether it is registered.
            </p>

            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-4 text-sm text-brand-ink font-medium"
            >
              Use a different address
            </button>

            <p className="mt-6 text-center text-sm text-gray-600">
              <Link to="/login" className="text-brand-ink font-medium">
                Back to sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-gray-900">
              Reset your password
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Enter the address you signed up with and we will email you a link.
            </p>

            {error && (
              <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none
                             focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full bg-brand-fill hover:bg-brand-fill-hover text-on-brand
                           font-semibold py-2 rounded-lg transition disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Email me a link'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-600">
              Remembered it?{' '}
              <Link to="/login" className="text-brand-ink font-medium">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
