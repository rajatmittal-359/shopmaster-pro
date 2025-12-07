// frontend/src/services/reviewService.js
import api from "../utils/api";

export const getProductReviews = (productId) =>
  api.get(`/reviews/product/${productId}`);

// ✅ MAIN CORRECT NAME (ProductDetailsPage me use ho raha hai)
export const createOrUpdateReview = (productId, data) =>
  api.post(`/reviews/product/${productId}`, data);

// ✅ OPTIONAL ALIAS (agar kahi aur purane naam se use ho raha ho)
export const addOrUpdateReview = (productId, data) =>
  createOrUpdateReview(productId, data);

export const deleteReview = (reviewId) =>
  api.delete(`/reviews/${reviewId}`);

export const getMyReviews = () =>
  api.get(`/reviews/me`);
