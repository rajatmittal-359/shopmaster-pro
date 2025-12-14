import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { getWishlist, removeFromWishlist } from "../../services/wishlistService";
import { addToCart } from "../../services/cartService";
import { useNavigate } from "react-router-dom";
import { toastSuccess, toastError } from "../../utils/toast";

export default function WishlistPage() {
  const [wishlist, setWishlist] = useState([]);
  const [qtyMap, setQtyMap] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadWishlist = async () => {
    try {
      const res = await getWishlist();
      const items = res.data.wishlist?.items || [];
      setWishlist(items);

      // default qty = 1
      const map = {};
      items.forEach((i) => {
        map[i.productId._id] = 1;
      });
      setQtyMap(map);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWishlist();
  }, []);

  const handleAddToCart = async (productId) => {
    const qty = qtyMap[productId] || 1;
    try {
      await addToCart({ productId, quantity: qty });
      toastSuccess("Added to cart");
    } catch (err) {
      toastError(err?.response?.data?.message || "Failed to add to cart");
    }
  };

  const handleRemove = async (productId) => {
    try {
      await removeFromWishlist(productId);
      loadWishlist();
      toastSuccess("Removed from wishlist");
    } catch (err) {
      toastError(
        err?.response?.data?.message || "Failed to remove from wishlist"
      );
    }
  };

  if (loading) {
    return (
      <Layout title="My Wishlist">
        <p className="p-6">Loading...</p>
      </Layout>
    );
  }

  return (
    <Layout title="My Wishlist">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-6">My Wishlist</h1>

        {/* EMPTY STATE */}
        {wishlist.length === 0 && (
          <div className="text-center text-gray-500 mt-20">
            <p className="mb-3">Your wishlist is empty ❤️</p>
            <button
              onClick={() => navigate("/shop")}  // public shop
              className="px-4 py-2 bg-orange-500 text-white rounded"
            >
              Continue Shopping
            </button>
          </div>
        )}

        {/* PRODUCT LIST */}
        {wishlist.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {wishlist.map((item) => {
              const p = item.productId;

              return (
                <div
                  key={p._id}
                  className="border rounded-lg shadow bg-white p-4 flex flex-col"
                >
                  {/* IMAGE */}
                  <div
                    onClick={() => navigate(`/products/${p._id}`)} // public product details
                    className="h-48 bg-gray-100 flex items-center justify-center rounded cursor-pointer"
                  >
                    {p.images?.[0] ? (
                      <img
                        src={p.images[0]}
                        className="h-full object-contain"
                        alt={p.name}
                      />
                    ) : (
                      "No Image"
                    )}
                  </div>

                  {/* INFO */}
                  <h3 className="mt-3 font-semibold text-sm line-clamp-2">
                    {p.name}
                  </h3>

                  <p className="text-orange-600 font-bold mt-1">
                    ₹{p.price}
                  </p>

                  <p className="text-xs text-gray-500 mt-1">
                    Stock: {p.stock}
                  </p>

                  {/* QTY CONTROL */}
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() =>
                        setQtyMap((prev) => ({
                          ...prev,
                          [p._id]: Math.max(1, (prev[p._id] || 1) - 1),
                        }))
                      }
                      className="px-3 py-1 border rounded"
                    >
                      −
                    </button>

                    <span className="font-semibold">
                      {qtyMap[p._id] || 1}
                    </span>

                    <button
                      onClick={() =>
                        setQtyMap((prev) => ({
                          ...prev,
                          [p._id]: (prev[p._id] || 1) + 1,
                        }))
                      }
                      className="px-3 py-1 border rounded"
                    >
                      +
                    </button>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleAddToCart(p._id)}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm py-2 rounded"
                    >
                      Add to Cart
                    </button>

                    <button
                      onClick={() => handleRemove(p._id)}
                      className="px-3 text-red-600 border border-red-500 rounded text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
