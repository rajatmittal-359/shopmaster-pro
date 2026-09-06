import api from "../utils/api";

// Analytics
export const getAdminAnalytics = () => api.get("/admin/analytics");

// Inventory Logs
export const getInventoryLogs = () => api.get("/inventory");

// Seller Management
export const getPendingSellers = () => api.get("/admin/sellers/pending");

export const approveSeller = (sellerId) => 
  api.patch(`/admin/sellers/${sellerId}/approve`);

export const rejectSeller = (sellerId) => 
  api.patch(`/admin/sellers/${sellerId}/reject`);

export const suspendSeller = (sellerId, reason) => 
  api.patch(`/admin/sellers/${sellerId}/suspend`, { reason });

export const activateSeller = (sellerId) => 
  api.patch(`/admin/sellers/${sellerId}/activate`);

/**
 * PAYOUTS
 *
 * The whole settlement feature - five endpoints, fully tested - had no UI at
 * all, which is why no payout had ever been created.
 */

/** Every seller currently owed money, and the total. */
export const getPayableSellers = () => api.get('/admin/payouts/payable');

/** Past and pending payouts. @param {{sellerId?, status?}} [params] */
export const listPayouts = (params = {}) => api.get('/admin/payouts', { params });

/** Settles everything currently owed to one seller into a single payout. */
export const createPayout = (sellerId) => api.post('/admin/payouts', { sellerId });

/** Records that the bank transfer went through. `reference` is the UTR. */
export const markPayoutPaid = (payoutId, { reference, notes }) =>
  api.patch(`/admin/payouts/${payoutId}/paid`, { reference, notes });

/** Records a failed transfer; its sales return to the payable pool. */
export const markPayoutFailed = (payoutId, reason) =>
  api.patch(`/admin/payouts/${payoutId}/failed`, { reason });

/** Every order on the platform. The admin could already fetch these; there was no screen. */
export const getAllOrders = (params) => api.get('/admin/orders', { params });

/**
 * The platform calling off an order. The reason is required: it is shown to
 * the customer and kept on the order.
 */
export const cancelOrderAsAdmin = (orderId, reason) =>
  api.post(`/admin/orders/${orderId}/cancel`, { reason });

/**
 * Deciding a dispute.
 *
 * The platform decides, not either side - which only means anything because the
 * seller's money is still held while it is open. Amazon's A-to-z works the same
 * way, and the reason is kept on the order so a decision can be read back later
 * by somebody who was not there.
 */
export const resolveDispute = (orderId, { inFavourOf, resolution, sellerId }) =>
  api.post(`/admin/orders/${orderId}/dispute/resolve`, {
    inFavourOf,
    resolution,
    sellerId,
  });

/**
 * What the platform charges one seller.
 *
 * Rates are snapshotted onto every order line when the order is placed, so this
 * only ever changes what happens from here on - it cannot rewrite what a seller
 * was already owed.
 */
export const setSellerCommission = (sellerId, commissionRate) =>
  api.patch(`/admin/sellers/${sellerId}/commission`, { commissionRate });
