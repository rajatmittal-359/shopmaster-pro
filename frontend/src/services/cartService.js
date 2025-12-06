import api from '../utils/api';

export const getCart = () => api.get('/customer/cart');
export const addToCart = (data) => api.post('/customer/cart', data);
export const updateCartItem = (data) => api.patch('/customer/cart', data);
export const removeFromCart = (productId) =>
  api.delete(`/customer/cart/${productId}`);
export const clearCart = () => api.delete('/customer/cart');
