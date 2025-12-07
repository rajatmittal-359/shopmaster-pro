import api from '../utils/api';

export const getSellerOrders = () =>
  api.get('/seller/orders');

export const updateSellerOrderStatus = (orderId, status) =>
  api.patch(`/seller/orders/${orderId}/status`, { status });