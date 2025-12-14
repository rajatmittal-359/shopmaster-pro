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
