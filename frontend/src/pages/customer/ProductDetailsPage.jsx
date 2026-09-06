// frontend/src/pages/customer/ProductDetailsPage.jsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Heart, Minus, Plus, Play } from "lucide-react";

import Layout from "../../components/common/Layout";
import { getProductDetails } from "../../services/productService";
import { useCart } from "../../context/cartContext";
import { useWishlist } from "../../context/wishlistContext";
import {
  getProductReviews,
  createOrUpdateReview,
  deleteReview,
} from "../../services/reviewService";
import { toastSuccess, toastError } from '../../utils/toast';
import Seo, { productJsonLd } from '../../components/common/Seo';

import { useAuth } from '../../context/authContext';
import { useConfirm } from '../../context/confirmContext';
import { priceOf } from '../../utils/pricing';
export default function ProductDetailsPage() {
  const confirm = useConfirm();
  const { productId } = useParams();
  const { user, role } = useAuth();

  const [product, setProduct] = useState(null);
  const [activeImage, setActiveImage] = useState("");
  /*
   * The gallery is showing the clip rather than a still.
   *
   * A separate flag rather than a magic value in activeImage: the two are
   * different kinds of thing, and conflating them is how a video URL ends up in
   * an <img> tag showing a broken icon.
   */
  const [showingVideo, setShowingVideo] = useState(false);
  const [loading, setLoading] = useState(true);

  const [qty, setQty] = useState(1);

  /*
   * The cart and the wishlist come from the shared providers now.
   *
   * This page kept its own copy of both, and passed the URL parameter - which
   * is the SLUG on every canonical link - straight to the API as a productId.
   * The backend does Product.findById on it, so Add to Cart and the heart
   * threw on exactly the URLs the shop links to. Everything below sends
   * product._id, and the badge in the header moves because the state is shared.
   */
  const { quantityOf, setQuantity } = useCart();
  const { isWishlisted, toggle: toggleWishlisted } = useWishlist();
  const liked = product ? isWishlisted(product._id) : false;
  const inCart = product ? quantityOf(product._id) : 0;

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

  /**
   * Adds the chosen quantity to whatever is already in the cart.
   *
   * The selector above says how many MORE to put in, so it has to be added to
   * the existing line rather than replacing it - press Add twice for one each
   * and you meant two.
   */
  const handleAddToCart = async () => {
    const wanted = inCart + qty;
    if (wanted > product.stock) {
      toastError(
        inCart
          ? `Only ${product.stock} available and ${inCart} already in your cart`
          : `Only ${product.stock} items available`
      );
      return;
    }

    const result = await setQuantity(product._id, wanted);
    if (!result.ok) {
      toastError(result.message);
      return;
    }
    toastSuccess(`${wanted} in your cart`);
  };

  const toggleWishlist = async () => {
    const result = await toggleWishlisted(product._id);
    if (!result.ok) {
      toastError(result.message);
      return;
    }
    toastSuccess(result.wishlisted ? 'Added to wishlist' : 'Removed from wishlist');
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

    const sure = await confirm({
      title: 'Delete your review?',
      confirmLabel: 'Delete review',
    });
    if (!sure) return;

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

  // Canonical form of this product's URL. The slug is preferred; an id-based
  // link still resolves, but must not be advertised as canonical.
  const canonicalPath = `/products/${product.slug || product._id}`;
  const metaDescription = (product.description || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 155);

  return (
    <Layout title={product.name}>
      <Seo
        title={product.name}
        description={metaDescription}
        path={canonicalPath}
        image={product.images?.[0]}
        jsonLd={productJsonLd(product, canonicalPath)}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 p-4">
        {/* ✅ LEFT: IMAGE GALLERY */}
        <div>
          <div className="relative h-[420px] bg-gray-100 rounded-lg flex items-center justify-center mb-4">
            {showingVideo && product.video?.url ? (
              /*
                controls, and no autoPlay.

                A clip that plays itself on a phone spends the customer's data
                without asking, and on a slow connection it makes the page feel
                broken. The poster frame is shown until they choose to press
                play - which is also why it is stored.
              */
              <video
                src={product.video.url}
                poster={product.video.poster || undefined}
                controls
                playsInline
                preload="none"
                className="h-full w-full object-contain bg-black rounded-lg"
              />
            ) : activeImage ? (
              <img
                src={activeImage}
                className="h-full object-contain"
                alt={product.name}
              />
            ) : (
              "No Image"
            )}

            <button
              onClick={toggleWishlist}
              aria-pressed={liked}
              aria-label={liked ? 'Remove from wishlist' : 'Save to wishlist'}
              className="absolute top-3 right-3 bg-white p-2 rounded-full shadow hover:bg-gray-100
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              <Heart
                size={18}
                className={liked ? 'text-red-500' : 'text-gray-500'}
                fill={liked ? 'currentColor' : 'none'}
              />
            </button>
          </div>

          {/* Thumbnails. The clip sits first, which is where both Amazon and
              Flipkart put it - it is the thing a jewellery buyer wants most. */}
          <div className="flex gap-2 flex-wrap">
            {product.video?.url && (
              <button
                type="button"
                onClick={() => setShowingVideo(true)}
                aria-label="Play the product video"
                className={`relative w-16 h-16 rounded-lg overflow-hidden border bg-black
                            ${showingVideo ? 'border-brand-600' : 'border-gray-200'}`}
              >
                {product.video.poster && (
                  <img
                    src={product.video.poster}
                    alt=""
                    className="w-full h-full object-cover opacity-70"
                  />
                )}
                <span className="absolute inset-0 flex items-center justify-center">
                  <Play size={20} className="text-white drop-shadow" fill="currentColor" />
                </span>
              </button>
            )}

            {product.images?.map((img, i) => (
              <img
                key={i}
                src={img}
                alt=""
                onClick={() => {
                  setActiveImage(img);
                  setShowingVideo(false);
                }}
                className={`w-16 h-16 object-cover border rounded-lg cursor-pointer ${
                  !showingVideo && activeImage === img ? "border-brand-600" : ""
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
                  <span className="px-2 py-0.5 rounded-lg bg-positive text-white text-xs font-semibold">
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

          {/*
            The shop card showed "₹2900 ₹1999" and this page showed "₹1999"
            alone, so the saving disappeared at the moment the customer was
            deciding. Same numbers in both places now.
          */}
          {(() => {
            /*
             * The same rule as the card and the server - utils/pricing.js.
             * The percentage is rounded DOWN, never up: rounding 49.6% to 50%
             * to make an offer look rounder is a small lie, and small lies
             * about price are what the CCPA's dark-pattern guidelines are for.
             */
            const { price, was, percentOff, wasIsMrp, onSale } = priceOf(product);
            return (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-bold text-brand-ink">₹{price}</span>

                  {was && (
                    <span className="text-base text-gray-400 line-through">
                      {wasIsMrp && <span className="text-xs mr-1">M.R.P.</span>}₹{was}
                    </span>
                  )}

                  {percentOff > 0 && (
                    <span className="text-sm font-medium text-positive">
                      {percentOff}% off
                    </span>
                  )}
                </div>

                {/*
                  When a sale ends, said plainly. A countdown that is not real
                  is false urgency, which the guidelines name outright - so this
                  is the courier of a fact, not a timer.
                */}
                {onSale && product.saleEndsAt && (
                  <p className="text-xs text-gray-600 mt-1">
                    Sale price until{' '}
                    {new Date(product.saleEndsAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                )}

                {/* Delivery is quoted at checkout. Saying so here is what stops
                    the total being a surprise - the FirstCry finding exactly. */}
                <p className="text-xs text-gray-500 mt-1">
                  {product.freeShipping
                    ? 'Free delivery'
                    : 'Delivery calculated at checkout'}
                </p>
              </>
            );
          })()}

          <p className="text-sm">
            Stock:{" "}
            <span
              className={`font-semibold ${
                product.stock > 0 ? "text-positive" : "text-red-600"
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

          {/*
            The + used to count past the stock, so the only way to find out
            the shop could not supply that many was to press Add and be told.
            It stops at what is left, minus whatever is already in the cart.
          */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-sm text-gray-600">Quantity</span>
            <div className="flex items-center rounded-lg border">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                disabled={qty <= 1}
                aria-label="One fewer"
                className="px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Minus size={16} />
              </button>

              <span className="px-3 font-semibold tabular-nums" aria-live="polite">
                {qty}
              </span>

              <button
                onClick={() => setQty(qty + 1)}
                disabled={inCart + qty >= product.stock}
                aria-label="One more"
                className="px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {inCart > 0 && (
            <p className="text-sm text-gray-600 mt-2">
              {inCart} already in your cart ·{' '}
              <Link to="/customer/cart" className="text-brand-ink underline">
                View cart
              </Link>
            </p>
          )}

          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0 || inCart >= product.stock}
            className="mt-3 w-full max-w-xs bg-brand-fill hover:bg-brand-fill-hover text-on-brand py-2
                       rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {product.stock === 0
              ? 'Out of stock'
              : inCart >= product.stock
                ? 'All available stock is in your cart'
                : 'Add to Cart'}
          </button>

          {/* TRUST INFO */}
          <div className="border rounded-lg p-4 mt-4 text-sm text-gray-600 bg-gray-50">
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
        <div className="bg-white rounded-xl shadow p-4 mb-6">
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
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <textarea
                    name="comment"
                    value={reviewForm.comment}
                    onChange={handleReviewChange}
                    rows={3}
                    placeholder="Share your experience with this product"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                {reviewError && (
                  <p className="text-xs text-red-600">{reviewError}</p>
                )}
                {reviewMessage && (
                  <p className="text-xs text-positive">
                    {reviewMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingReview}
                  className="px-4 py-2 bg-brand-fill hover:bg-brand-fill-hover text-on-brand text-sm rounded-lg disabled:opacity-60"
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
        <div className="bg-white rounded-xl shadow p-4">
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
                    <p className="text-[11px] text-positive mt-1">
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
