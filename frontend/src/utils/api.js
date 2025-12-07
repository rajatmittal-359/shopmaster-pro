import axios from 'axios';

// ✅ Use localhost for local development, production URL for production
// Vite: import.meta.env.DEV is true in development, false in production
const baseURL = import.meta.env.DEV
  ? "http://localhost:5000/api"
  : "https://shopmaster-api.onrender.com/api";

const api = axios.create({
  baseURL: baseURL,
  withCredentials: false,
});
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

export default api;
