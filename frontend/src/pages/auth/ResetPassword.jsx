import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { resetPassword } from '../../services/authService';

const MIN_LENGTH = 6;

/**
 * Choosing the new password, reached from the link in the email.
 *
 * The token comes from the query string and is never shown or stored - it goes
 * straight back to the server with the new password and is dead the moment it
 * is used.
 *
 * The two boxes are compared HERE rather than on the server, because a typo in
 * a password you cannot see is the ordinary failure of this screen, and finding
 * out about it by being locked out again is the worst possible moment.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError('Those two passwords are not the same');
      return;
    }

    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      // Long enough to read what happened, short enough not to be a wait.
      setTimeout(() => navigate('/login'), 1800);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          'Could not change your password. Please try again.'
      );
    } finally {
      setBusy(false);
    }
  };

  // A link with nothing in it cannot be recovered from, so say so straight away
  // rather than after the person has typed a password twice.
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6">
          <h1 className="text-xl font-semibold text-gray-900">
            That link is incomplete
          </h1>
          <p className="text-sm text-gray-600 mt-2">
            It may have been cut in half by your email app. Ask for a new one and
            open it in a single click.
          </p>
          <Link
            to="/forgot-password"
            className="mt-4 inline-block bg-brand-fill hover:bg-brand-fill-hover
                       text-on-brand font-semibold px-4 py-2 rounded-lg"
          >
            Send a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white shadow-md rounded-xl p-6">
        {done ? (
          <>
            <h1 className="text-xl font-semibold text-gray-900">
              Password changed
            </h1>
            <p className="text-sm text-gray-600 mt-2">
              You can sign in with it now. Taking you there…
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-gray-900">
              Choose a new password
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              At least {MIN_LENGTH} characters.
            </p>

            {error && (
              <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm mb-1">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none
                             focus:ring-2 focus:ring-brand-600"
                />
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm mb-1">
                  Type it again
                </label>
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                {busy ? 'Saving…' : 'Save new password'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-600">
              <Link to="/login" className="text-brand-ink font-medium">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
