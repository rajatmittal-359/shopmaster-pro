// frontend/src/services/productService.js
import api from '../utils/api';

// PUBLIC products list
export const getProducts = (params = {}) =>
  api.get('/public/products', { params });

// PUBLIC product details
export const getProductDetails = (productId) =>
  api.get(`/public/products/${productId}`);

// PUBLIC categories for seller form & filters
export const getCategories = () =>
  api.get('/public/products/categories/all');
