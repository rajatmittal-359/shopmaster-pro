import api from "../utils/api";

// ONLY ye 3 endpoints admin dashboard ke liye zaroori hain
export const getAdminAnalytics = () => api.get("/admin/analytics");

export const getInventoryLogs = () => api.get("/inventory");
