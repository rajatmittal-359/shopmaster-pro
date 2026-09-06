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

export const cancelOrderItem = (orderId, itemId) =>
  api.patch(`/customer/orders/${orderId}/items/${itemId}/cancel`);

/**
 * Asking to send something back. A reason is required: the seller answers it,
 * and it is what an admin reads if the two of them disagree.
 *
 * This raises a REQUEST. No money moves until the goods are back with the
 * seller - see backend/utils/settleReturn.js.
 */
export const returnOrder = (orderId, reason, resolution = 'refund') =>
  api.post(`/customer/orders/${orderId}/return`, { reason, resolution });

/** "Yes, I got it" - on a delivery only the seller claimed. */
export const confirmReceipt = (orderId) =>
  api.post(`/customer/orders/${orderId}/confirm-receipt`);

/** "This is wrong." Decides nothing, but stops the seller being paid. */
export const raiseDispute = (orderId, reason) =>
  api.post(`/customer/orders/${orderId}/dispute`, { reason });
  
/**
 * Check a code before committing to anything.
 *
 * Never spends a use. The checkout re-evaluates from scratch, so this is a
 * preview and not a promise - a code that expires in between is still caught.
 */
export const previewCoupon = (code) =>
  api.post('/customer/coupons/preview', { code });
