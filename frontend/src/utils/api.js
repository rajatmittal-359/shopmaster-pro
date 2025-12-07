import axios from 'axios';


const api = axios.create({
  baseURL: "https://shopmaster-api.onrender.com/api",
  withCredentials: false,

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
