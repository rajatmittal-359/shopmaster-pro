import api from '../utils/api';

export const checkoutOrder = (shippingAddressId) =>
  api.post('/customer/checkout', { shippingAddressId });

export const getMyOrders = (params = {}) =>
  api.get('/customer/orders', { params });

export const getOrderDetails = (orderId) =>
  api.get(`/customer/orders/${orderId}`);

export const cancelOrder = (orderId) =>
  api.patch(`/customer/orders/${orderId}/cancel`);

export const returnOrder = (orderId) =>
  api.post(`/customer/orders/${orderId}/return`);
