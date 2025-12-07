// frontend/src/pages/customer/ProductDetailsPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";

import Layout from "../../components/common/Layout";
import { getProductDetails } from "../../services/productService";
import { addToCart } from "../../services/cartService";
import {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
} from "../../services/wishlistService";
import {
  getProductReviews,
  createOrUpdateReview,
  deleteReview,
} from "../../services/reviewService";

export default function ProductDetailsPage() {
  const { productId } = useParams();
  const { user, role } = useSelector((state) => state.auth);

  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState("");
  const [loading, setLoading] = useState(true);

  const [qty, setQty] = useState(1);
  const [liked, setLiked] = useState(false);

  // ✅ Reviews state
  const [reviews, setReviews] = useState([]);
  const [savingReview, setSavingReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 0,
    title: "",
    comment: "",
  });
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        // ✅ PRODUCT DETAILS
        const res = await getProductDetails(productId);
        const p = res.data.product;
        setProduct(p);
        setActiveImage(p.images?.[0] || "");

        // ✅ WISHLIST STATUS
        try {
          const wishRes = await getWishlist();
          const items = wishRes.data.wishlist?.items || [];
          const found = items.some((item) => item.productId?._id === p._id);
          setLiked(found);
        } catch (err) {
          console.error("Error loading wishlist:", err);
        }

        // ✅ REVIEWS LOAD
        try {
          const revRes = await getProductReviews(productId);
          const list = revRes.data.reviews || [];
          setReviews(list);

          // Agar user logged in hai aur pehle se review likha hai → form prefill
          if (user && role === "customer") {
            const mine = list.find(
              (r) => r.userId?._id === user._id
            );
            if (mine) {
              setReviewForm({
                rating: mine.rating,
                title: mine.title || "",
                comment: mine.comment || "",
              });
            }
          }
        } catch (err) {
          console.error("Error loading reviews:", err);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // ✅ CART
  const handleAddToCart = async () => {
    try {
      await addToCart({ productId, quantity: qty });
      alert("Added to cart"); // existing pattern, baad me global toast laga sakte hain
    } catch (err) {
      alert(err.response?.data?.message || "Failed to add to cart");
    }
  };

  // ✅ WISHLIST
  const toggleWishlist = async () => {
    try {
      if (liked) {
        await removeFromWishlist(productId);
        setLiked(false);
      } else {
        await addToWishlist(productId);
        setLiked(true);
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update wishlist");
    }
  };

  // ✅ REVIEW: rating select
  const handleRatingClick = (value) => {
    setReviewForm((prev) => ({ ...prev, rating: value }));
    setReviewError("");
    setReviewMessage("");
  };

  // ✅ REVIEW: input change (title/comment)
  const handleReviewChange = (e) => {
    const { name, value } = e.target;
    setReviewForm((prev) => ({ ...prev, [name]: value }));
    setReviewError("");
    setReviewMessage("");
  };

  // ✅ REVIEW: submit (create/update)
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    setReviewError("");
    setReviewMessage("");

    if (!user || role !== "customer") {
      setReviewError("Please login as a customer to write a review.");
      return;
    }

    if (!reviewForm.rating || reviewForm.rating < 1 || reviewForm.rating > 5) {
      setReviewError("Please select a rating between 1 and 5 stars.");
      return;
    }

    try {
      setSavingReview(true);
      const payload = {
        rating: reviewForm.rating,
        title: reviewForm.title?.trim() || "",
        comment: reviewForm.comment?.trim() || "",
      };

      const res = await createOrUpdateReview(productId, payload);
      const saved = res.data.review;

      // Local state update: replace / add review
      setReviews((prev) => {
        const idx = prev.findIndex(
          (r) => r.userId?._id === user._id
        );
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], ...saved };
          return copy;
        }
        return [saved, ...prev];
      });

      setReviewMessage("Review saved successfully.");
    } catch (err) {
      const msg =
        err.response?.data?.message || "Failed to save review.";
      setReviewError(msg);
    } finally {
      setSavingReview(false);
    }
  };

  // ✅ REVIEW: delete my review
  const handleDeleteMyReview = async () => {
    if (!user) return;

    const mine = reviews.find((r) => r.userId?._id === user._id);
    if (!mine) return;

    if (!window.confirm("Delete your review?")) return;

    try {
      await deleteReview(mine._id);
      setReviews((prev) => prev.filter((r) => r._id !== mine._id));
      setReviewForm({ rating: 0, title: "", comment: "" });
      setReviewMessage("Review deleted.");
    } catch (err) {
      const msg =
        err.response?.data?.message || "Failed to delete review.";
      setReviewError(msg);
    }
  };

  if (loading) {
    return (
      <Layout title="Product">
        <p className="p-6">Loading...</p>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout title="Product">
        <p className="p-6">Product not found</p>
      </Layout>
    );
  }

  // ✅ Helper: render stars read-only
  const renderStars = (value) => {
    const v = Math.round(value || 0);
    return (
      <span className="text-yellow-500 text-sm">
        {"★".repeat(v)}
        <span className="text-gray-300">
          {"★".repeat(5 - v)}
        </span>
      </span>
    );
  };

  const userHasReview =
    user &&
    role === "customer" &&
    reviews.some((r) => r.userId?._id === user._id);

  return (
    <Layout title={product.name}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 p-4">
        {/* ✅ LEFT: IMAGE GALLERY */}
        <div>
          <div className="relative h-[420px] bg-gray-100 rounded flex items-center justify-center mb-4">
            {activeImage ? (
              <img
                src={activeImage}
                className="h-full object-contain"
                alt={product.name}
              />
            ) : (
              "No Image"
            )}

            {/* Wishlist Heart */}
            <button
              onClick={toggleWishlist}
              className="absolute top-3 right-3 bg-white p-2 rounded-full shadow"
            >
              {liked ? "❤️" : "🤍"}
            </button>
          </div>

          {/* Thumbnails */}
          <div className="flex gap-2">
            {product.images?.map((img, i) => (
              <img
                key={i}
                src={img}
                onClick={() => setActiveImage(img)}
                className={`w-16 h-16 object-cover border rounded cursor-pointer ${
                  activeImage === img ? "border-orange-500" : ""
                }`}
              />
            ))}
          </div>
        </div>

        {/* ✅ RIGHT: PRODUCT INFO + REVIEWS */}
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold">{product.name}</h1>

          {/* Avg Rating + total reviews */}
          <div className="flex items-center gap-3 text-sm">
            {product.avgRating > 0 ? (
              <>
                <div className="flex items-center gap-1">
                  <span className="px-2 py-0.5 rounded bg-green-600 text-white text-xs font-semibold">
                    {product.avgRating.toFixed(1)} ★
                  </span>
                  <span className="text-gray-600">
                    {product.totalReviews} rating
                    {product.totalReviews === 1 ? "" : "s"}
                  </span>
                </div>
              </>
            ) : (
              <span className="text-gray-500 text-sm">
                No ratings yet
              </span>
            )}
          </div>

          <p className="text-2xl font-bold text-orange-600">
            ₹{product.price}
          </p>

          <p className="text-sm">
            Stock:{" "}
            <span
              className={`font-semibold ${
                product.stock > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {product.stock}
            </span>
          </p>

          <p className="text-sm text-gray-500">
            Seller: {product.sellerId?.name || "Unknown"}
          </p>

          <p className="text-sm text-gray-500">
            Category: {product.category?.name || "N/A"}
          </p>

          {/* Quantity Selector */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => qty > 1 && setQty(qty - 1)}
              className="px-3 py-1 border rounded"
            >
              −
            </button>

            <span className="font-semibold">{qty}</span>

            <button
              onClick={() => setQty(qty + 1)}
              className="px-3 py-1 border rounded"
            >
              +
            </button>
          </div>

          {/* Add to Cart */}
          <button
            onClick={handleAddToCart}
            className="mt-3 w-full max-w-xs bg-orange-500 hover:bg-orange-600 text-white py-2 rounded font-semibold"
          >
            Add to Cart
          </button>

          {/* TRUST INFO */}
          <div className="border rounded p-4 mt-4 text-sm text-gray-600 bg-gray-50">
            ✅ 7 Days Replacement <br />
            ✅ Cash on Delivery Available <br />
            ✅ Secure Payments
          </div>

          {/* PRODUCT DESCRIPTION */}
          <div className="mt-6">
            <h3 className="font-semibold text-lg mb-2">
              Product Details
            </h3>
            <div
              className="prose max-w-none text-sm"
              dangerouslySetInnerHTML={{
                __html: product.description,
              }}
            />
          </div>
        </div>
      </div>

      {/* ✅ REVIEWS SECTION */}
      <div className="mt-8 px-4 pb-8 max-w-5xl mx-auto">
        <h2 className="text-xl font-bold mb-4">
          Ratings &amp; Reviews
        </h2>

        {/* Review form (customer only) */}
        <div className="bg-white rounded shadow p-4 mb-6">
          {user && role === "customer" ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">
                  {userHasReview ? "Edit your review" : "Write a review"}
                </h3>
                {userHasReview && (
                  <button
                    onClick={handleDeleteMyReview}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete my review
                  </button>
                )}
              </div>

              {/* Rating stars input */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-600">
                  Your rating:
                </span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => handleRatingClick(star)}
                    className="text-xl"
                  >
                    {reviewForm.rating >= star ? "★" : "☆"}
                  </button>
                ))}
              </div>

              <form onSubmit={handleReviewSubmit} className="space-y-3">
                <div>
                  <input
                    type="text"
                    name="title"
                    value={reviewForm.title}
                    onChange={handleReviewChange}
                    placeholder="Review title (optional)"
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <textarea
                    name="comment"
                    value={reviewForm.comment}
                    onChange={handleReviewChange}
                    rows={3}
                    placeholder="Share your experience with this product"
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>

                {reviewError && (
                  <p className="text-xs text-red-600">{reviewError}</p>
                )}
                {reviewMessage && (
                  <p className="text-xs text-green-600">
                    {reviewMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingReview}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded disabled:opacity-60"
                >
                  {savingReview
                    ? "Saving..."
                    : userHasReview
                    ? "Update Review"
                    : "Submit Review"}
                </button>
              </form>
            </>
          ) : (
            <p className="text-sm text-gray-600">
              Please login as a customer to write a review.
            </p>
          )}
        </div>

        {/* Reviews list */}
        <div className="bg-white rounded shadow p-4">
          {reviews.length === 0 ? (
            <p className="text-sm text-gray-500">
              No reviews yet. Be the first to review this product.
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((rev) => (
                <div
                  key={rev._id}
                  className="border-b last:border-b-0 pb-3 last:pb-0"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {rev.userId?.name || "Customer"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      {renderStars(rev.rating)}
                      <span className="ml-1 text-gray-600">
                        {rev.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  {rev.title && (
                    <p className="text-sm font-medium">{rev.title}</p>
                  )}
                  {rev.comment && (
                    <p className="text-sm text-gray-700 mt-0.5">
                      {rev.comment}
                    </p>
                  )}
                  {user && rev.userId?._id === user._id && (
                    <p className="text-[11px] text-green-600 mt-1">
                      (Your review)
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
