import api from "../utils/api";

export const getWishlist = () => {
  return api.get("/customer/wishlist");
};

export const addToWishlist = (productId) => {
  return api.post("/customer/wishlist", { productId });
};

export const removeFromWishlist = (productId) => {
  return api.delete(`/customer/wishlist/${productId}`);
};

export const clearWishlist = () => {
  return api.delete("/customer/wishlist");
};
