import api from '../utils/api';

export const getProducts = (params = {}) =>
  api.get('/customer/products', { params });

export const getProductDetails = (productId) =>
  api.get(`/customer/products/${productId}`);

// PUBLIC categories for seller form
export const getCategories = () =>
  api.get('/public/products/categories/all');
