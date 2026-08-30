import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: false,
});

/**
 * Called when the server says our token is no longer good.
 *
 * Registered by AuthContext rather than imported, because this module must not
 * depend on React. Left as a no-op until then so an early request cannot crash.
 */
let onUnauthorized = () => {};

export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = typeof handler === 'function' ? handler : () => {};
};

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('smp_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Handles an expired or rejected token in ONE place.
 *
 * THE BUG THIS FIXES
 *   Tokens last seven days. There was no response interceptor, so on day eight
 *   every request returned 401 "Token expired" and each page's catch block sent
 *   it to console.error. ProtectedRoute only checked that a token STRING
 *   existed, never that it still worked, so the user was let through to a
 *   dashboard where nothing loaded: no error, no redirect, no explanation. They
 *   stayed stuck until they happened to log out by hand.
 *
 *   Every user hit this, every seven days.
 *
 * Login and register are excluded: a 401 there is a wrong password, which the
 * form should show, not a dead session.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isAuthAttempt = /\/auth\/(login|register|verify-otp)$/.test(url);

    if (status === 401 && !isAuthAttempt && localStorage.getItem('smp_token')) {
      onUnauthorized(error.response?.data?.message || 'Your session has expired');
    }

    return Promise.reject(error);
  }
);

export default api;
