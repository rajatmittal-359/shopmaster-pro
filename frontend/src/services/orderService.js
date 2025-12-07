import api from "../utils/api";

// ✅ CHECKOUT (SIRF shippingAddressId BHEJNA HAI)
export const checkoutOrder = async (shippingAddressId) => {
  return api.post("/customer/checkout", {
    shippingAddressId: shippingAddressId,
  });
};

// ✅ GET MY ORDERS
export const getMyOrders = (params = {}) =>
  api.get("/customer/orders", { params });

// ✅ GET ORDER DETAILS
export const getOrderDetails = (orderId) =>
  api.get(`/customer/orders/${orderId}`);

// ✅ CANCEL ORDER
export const cancelOrder = (orderId) =>
  api.patch(`/customer/orders/${orderId}/cancel`);

// ✅ RETURN ORDER
export const returnOrder = (orderId) =>
  api.post(`/customer/orders/${orderId}/return`);
  