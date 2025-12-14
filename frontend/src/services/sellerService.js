import api from '../utils/api';
// Profile
export const getSellerProfile = () => api.get('/seller/profile');
// Products
export const getMyProducts = () => api.get('/seller/products');
export const addProduct = (data) => api.post('/seller/products', data);
export const updateProduct = (productId, data) =>
  api.patch(`/seller/products/${productId}`, data);
export const deleteProduct = (productId) =>
  api.delete(`/seller/products/${productId}`);
export const updateStock = (productId, stock) =>
  api.patch(`/seller/products/${productId}/stock`, { stock });
// Orders
export const getSellerOrders = () => api.get('/seller/orders');
export const updateOrderStatus = (orderId, status) =>
  api.patch(`/seller/orders/${orderId}/status`, { status });

// Analytics
export const getSellerAnalytics = () => api.get('/seller/analytics');
export const updateTracking = (orderId, data) =>
  api.patch(`/seller/orders/${orderId}/tracking`, data);


// Get single order details
export const getOrderDetails = (orderId) => api.get(`/seller/orders/${orderId}`);

