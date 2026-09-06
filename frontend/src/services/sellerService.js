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

/** Books the courier the customer paid for, once the parcel is packed. */
export const shipOrder = (orderId) => api.post(`/seller/orders/${orderId}/ship`);

/** Calls the courier off, while it has not collected yet. */
export const cancelShipment = (orderId) => api.post(`/seller/orders/${orderId}/ship/cancel`);

/**
 * MONEY
 *
 * These endpoints existed on the server from the start but nothing ever called
 * them, so a seller had no way to see what they had earned and no way to give
 * the shop an account to pay it into - which also meant no seller could ever
 * be paid, because a payout is refused without bank details.
 */

/** What this seller has earned, is owed, and has already been sent. */
export const getMyEarnings = () => api.get('/seller/earnings');

/** Bank details on file. The account number comes back masked. */
export const getPayoutDetails = () => api.get('/seller/payout-details');

/** @param {{accountNumber, ifscCode, accountHolderName, gstNumber?}} details */
export const updatePayoutDetails = (details) =>
  api.patch('/seller/payout-details', details);

/**
 * Calling off this seller's own lines - out of stock, damaged, cannot supply.
 * Not the same as cancelling the courier booking, which leaves the order live.
 */
export const cancelOwnLines = (orderId, reason) =>
  api.post(`/seller/orders/${orderId}/cancel`, { reason });

/**
 * Closing out a return on this seller's parcel.
 *
 * 'receive' settles it the way the CUSTOMER asked when they opened it: their
 * money back, or the same item again. Either way it is settled when the goods
 * are back, never when they are asked for.
 *
 * 'replace' is the second half of an exchange - the new parcel actually going
 * out. Separate from 'receive' because it happens later, once the seller has
 * packed one. 'reject' needs a reason, which the customer is shown and can
 * dispute.
 */
export const settleReturn = (orderId, action, reason) =>
  api.post(`/seller/orders/${orderId}/return`, { action, reason });

/** A seller's own shop settings: free shipping, and the pickup address. */
export const getSellerSettings = () => api.get('/seller/settings');

export const updateSellerSettings = (settings) => api.patch('/seller/settings', settings);
