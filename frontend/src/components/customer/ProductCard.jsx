import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
} from '../../services/wishlistService';
import { addToCart, removeFromCart } from '../../services/cartService';
import { toastSuccess, toastError } from '../../utils/toast';

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '');
}

export default function ProductCard({ product }) {
  const [liked, setLiked] = useState(false);
  const [inCart, setInCart] = useState(false);

  const { token, role } = useSelector((state) => state.auth);

  const image = product.images?.[0];
  const plainDesc = stripHtml(product.description);
  const shortDesc =
    plainDesc.length > 90 ? plainDesc.slice(0, 90).trim() + '…' : plainDesc;

  const isLowStock =
    typeof product.lowStockThreshold === 'number' &&
    product.stock <= product.lowStockThreshold;

  // ✅ Wishlist status – only for logged-in customers
  useEffect(() => {
    const checkWishlist = async () => {
      try {
        if (!token || role !== 'customer') return;

        const res = await getWishlist();
        const items = res.data.wishlist?.items || [];
        const found = items.some((i) => i.productId?._id === product._id);
        setLiked(found);
      } catch (err) {
        console.error('Wishlist load error', err);
      }
    };

    checkWishlist();
  }, [product._id, token, role]);

  // ✅ Cart toggle – only for logged-in customers
  const handleCartToggle = async () => {
    if (!token || role !== 'customer') {
      toastError('Please login as a customer to use cart');
      return;
    }

    try {
      if (!inCart) {
        await addToCart({ productId: product._id, quantity: 1 });
        setInCart(true);
        toastSuccess('Added to cart');
      } else {
        await removeFromCart(product._id);
        setInCart(false);
        toastSuccess('Removed from cart');
      }
    } catch (err) {
      toastError(err?.response?.data?.message || 'Failed to update cart');
    }
  };

  // ✅ Wishlist toggle – only for logged-in customers
  const toggleWishlist = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (!token || role !== 'customer') {
      toastError('Please login as a customer to use wishlist');
      return;
    }

    try {
      if (liked) {
        await removeFromWishlist(product._id);
        setLiked(false);
        toastSuccess('Removed from wishlist');
      } else {
        await addToWishlist(product._id);
        setLiked(true);
        toastSuccess('Added to wishlist');
      }
    } catch (err) {
      toastError(err?.response?.data?.message || 'Failed to update wishlist');
    }
  };

  return (
    <div className="group bg-white rounded-lg shadow-sm hover:shadow-md transition border flex flex-col">
      {/* Image */}
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-lg bg-gray-100">
        <Link to={`/products/${product._id}`}>
          {image ? (
            <img
              src={image}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
              No image
            </div>
          )}
        </Link>

        {/* Wishlist */}
        <button
          onClick={toggleWishlist}
          className="absolute top-2 right-2 bg-white/95 backdrop-blur rounded-full p-1 shadow hover:bg-gray-100"
        >
          {liked ? '❤️' : '🤍'}
        </button>

        {/* Low Stock */}
        {isLowStock && (
          <span className="absolute top-2 left-2 px-2 py-0.5 text-[11px] rounded-full bg-red-100 text-red-700">
            Low stock
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 p-3 flex flex-col gap-1">
        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-orange-600">
          {product.name}
        </h3>
        {shortDesc && (
          <p className="text-xs text-gray-600 line-clamp-2">{shortDesc}</p>
        )}
        <p className="text-[11px] text-gray-500 mt-1">
          Seller: {product.sellerId?.name || 'Unknown'}
        </p>
        <p className="text-[11px] text-gray-500">
          Category: {product.category?.name || 'Uncategorized'}
        </p>

        <div className="flex items-center justify-between mt-2">
          <span className="text-base font-bold text-orange-600">
            ₹{product.price}
          </span>
          <span className="text-[11px] text-gray-500">
            Stock: {product.stock}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 px-3 pb-3">
        <button
          type="button"
          onClick={handleCartToggle}
          className={`w-full px-3 py-1.5 text-white text-sm rounded transition ${
            inCart ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-500 hover:bg-orange-600'
          }`}
        >
          {inCart ? 'Remove from Cart' : 'Add to Cart'}
        </button>
      </div>

      <Link
        to={`/products/${product._id}`}
        className="mx-3 mb-3 w-auto text-center border border-orange-500 text-orange-600 text-xs font-semibold py-1.5 rounded hover:bg-orange-500 hover:text-white transition"
      >
        View Details
      </Link>
    </div>
  );
}
