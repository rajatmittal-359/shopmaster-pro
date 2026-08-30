import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import { registerUser, verifyOtp, loginUser, getMe } from '../services/authService';
import { setUnauthorizedHandler } from '../utils/api';
import { AuthContext } from './authContext';

const readStoredSession = () => ({
  token: localStorage.getItem('smp_token') || null,
  role: localStorage.getItem('smp_role') || null,
});

const persistSession = (token, role) => {
  localStorage.setItem('smp_token', token);
  localStorage.setItem('smp_role', role);
};

const clearStoredSession = () => {
  localStorage.removeItem('smp_token');
  localStorage.removeItem('smp_role');
};

/** Pulls the useful message out of an axios failure. */
const messageFrom = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

/**
 * Who is signed in, and everything that changes it.
 *
 * WHY THIS REPLACED REDUX
 *   The store held exactly one slice - auth - and all eight components that
 *   read it read `state.auth` and nothing else. Redux exists to coordinate many
 *   pieces of state that cut across each other; here it was managing a login
 *   token behind 165 lines of thunks and reducers.
 *
 *   The deciding factor was not tidiness. Expiry handling had to be rewritten
 *   anyway (see below), and that meant touching auth regardless. Doing both at
 *   once means auth is disturbed once instead of twice.
 *
 * THE EXPIRY BUG IT FIXES
 *   The old slice cleared `user` and `role` when loading the user failed, but
 *   left `token` in place - the original code even carried a note calling the
 *   cleanup "optional". ProtectedRoute only checked that a token string
 *   existed, so an expired session still passed the gate and the customer
 *   landed on a dashboard that silently loaded nothing.
 *
 *   Now a 401 from anywhere clears the session, says so, and returns the
 *   customer to the login page.
 */
export function AuthProvider({ children }) {
  const stored = readStoredSession();

  const [user, setUser] = useState(null);
  const [token, setToken] = useState(stored.token);
  const [role, setRole] = useState(stored.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tempEmail, setTempEmail] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const logout = useCallback(() => {
    clearStoredSession();
    setUser(null);
    setToken(null);
    setRole(null);
    setError(null);
    setTempEmail(null);
  }, []);

  /** A session that has run out is not an error the customer caused. */
  const endExpiredSession = useCallback(
    (message) => {
      // Nothing to end, and nothing to explain, if they were never signed in.
      if (!localStorage.getItem('smp_token')) return;
      logout();
      toast.error(message || 'Your session has expired. Please sign in again.');
    },
    [logout]
  );

  // One place decides what an expired token means, for every request the app
  // makes. Registered here because api.js must stay free of React.
  useEffect(() => {
    setUnauthorizedHandler(endExpiredSession);
    return () => setUnauthorizedHandler(null);
  }, [endExpiredSession]);

  const adopt = useCallback((payload) => {
    const nextRole = payload.role || payload.user?.role || null;
    setToken(payload.token);
    setRole(nextRole);
    setUser(payload.user || null);
    persistSession(payload.token, nextRole);
  }, []);

  /** Runs a request that ends in a signed-in session. */
  const attempt = useCallback(
    async (request, fallbackMessage, onSuccess) => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await request();
        if (onSuccess) onSuccess(data);
        return { ok: true, data };
      } catch (err) {
        const message = messageFrom(err, fallbackMessage);
        setError(message);
        return { ok: false, message };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const login = useCallback(
    (credentials) => attempt(() => loginUser(credentials), 'Login failed', adopt),
    [attempt, adopt]
  );

  const verify = useCallback(
    (payload) =>
      attempt(() => verifyOtp(payload), 'OTP verification failed', (data) => {
        adopt(data);
        setTempEmail(null);
      }),
    [attempt, adopt]
  );

  const register = useCallback(
    (payload) => attempt(() => registerUser(payload), 'Registration failed'),
    [attempt]
  );


  // Confirm the stored token still works whenever it changes - on sign-in, and
  // once on a page refresh. An expired one is caught by the interceptor, which
  // ends the session rather than leaving the customer on a dead dashboard.
  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await getMe();
        if (cancelled) return;
        setUser(data.user || data);
        if (data.role || data.user?.role) setRole(data.role || data.user.role);
      } catch {
        /* an expired token is handled by the response interceptor */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      role,
      loading,
      error,
      tempEmail,
      isLoggedIn: Boolean(token && role),
      login,
      register,
      verifyOtp: verify,
      logout,
      clearError,
      setTempEmail,
    }),
    [user, token, role, loading, error, tempEmail, login, register, verify, logout, clearError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
