import { Link } from 'react-router-dom';
import { Heart, Minus, Plus, Play } from 'lucide-react';
import { toastSuccess, toastError } from '../../utils/toast';

import { useAuth } from '../../context/authContext';
import { useWishlist } from '../../context/wishlistContext';
import { useCart } from '../../context/cartContext';
import Button from '../ui/Button';
import { priceOf } from '../../utils/pricing';
function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '');
}

export default function ProductCard({ product }) {
  const { token, role } = useAuth();
  const { quantityOf, setQuantity } = useCart();

  /**
   * How many of this product are in the cart, read from the one shared cart
   * rather than guessed per card.
   *
   * Each card used to hold its own `useState(false)`, initialised from
   * nothing: reload the shop with a full cart and every card claimed the
   * product was not in it, and pressing Add again quietly compounded the
   * quantity on the server while the card showed no sign of it.
   */
  const qty = quantityOf(product._id);
  const { isWishlisted, toggle: toggleWishlisted } = useWishlist();

  // Read from the one shared list rather than fetching it per card.
  const liked = isWishlisted(product._id);

  const image = product.images?.[0];
  const plainDesc = stripHtml(product.description);
  const shortDesc =
    plainDesc.length > 90 ? plainDesc.slice(0, 90).trim() + '…' : plainDesc;

  const isLowStock =
    typeof product.lowStockThreshold === 'number' &&
    product.stock <= product.lowStockThreshold;


  /** Change how many of this product are in the cart. 0 removes it. */
  const changeQty = async (next) => {
    if (!token || role !== 'customer') {
      toastError('Please log in as a customer to use the cart');
      return;
    }
    if (next > product.stock) {
      toastError(`Only ${product.stock} left`);
      return;
    }

    const result = await setQuantity(product._id, next);
    if (!result.ok) toastError(result.message);
  };

  // ✅ Wishlist toggle – only for logged-in customers
  const toggleWishlist = async (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (!token || role !== 'customer') {
      toastError('Please login as a customer to use wishlist');
      return;
    }

    const result = await toggleWishlisted(product._id);
    if (!result.ok) {
      toastError(result.message);
      return;
    }
    toastSuccess(result.wishlisted ? 'Added to wishlist' : 'Removed from wishlist');
  };

  return (
    <div className="group bg-white rounded-xl shadow-sm hover:shadow-md transition border flex flex-col">
      {/* Image */}
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-xl bg-gray-100">
        {/* Canonical, same as View details - not the _id URL. */}
        <Link to={`/products/${product.slug || product._id}`}>
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
        {/*
          An emoji here rendered as a different picture on every platform and
          announced as "white heart" to a screen reader, which is not what the
          control does. The rest of the app moved to lucide; this is the last
          card that had not.
        */}
        <button
          onClick={toggleWishlist}
          aria-pressed={liked}
          aria-label={liked ? 'Remove from wishlist' : 'Save to wishlist'}
          className="absolute top-2 right-2 bg-white/95 backdrop-blur rounded-full p-1.5 shadow
                     hover:bg-gray-100 focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-brand-700"
        >
          <Heart
            size={16}
            className={liked ? 'text-red-500' : 'text-gray-500'}
            fill={liked ? 'currentColor' : 'none'}
          />
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
        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-brand-ink">
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

        {/*
          justify-between with no gap: once the price and the stock together
          filled the row they simply touched, and it read as "₹1999Stock: 12".
          A gap keeps them apart and wrapping lets stock drop to its own line
          on a narrow card rather than being squeezed against the price.
        */}
        {/* Says a clip exists before the customer opens the product - the same
            hint Flipkart puts on a listing card. */}
        {product.video?.url && (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 mt-1">
            <Play size={11} fill="currentColor" />
            Video
          </span>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-2">
          {/*
            One pricing rule for every surface - see utils/pricing.js. A card
            that says one number while the checkout charges another is the
            drip-pricing complaint, not a display bug.

            "M.R.P." is labelled when that is what the struck-through figure is,
            because under the Legal Metrology rules it means something specific:
            the legal maximum, not our old price.
          */}
          <div className="flex items-center gap-2 flex-wrap">
            {(() => {
              const { price, was, percentOff, wasIsMrp } = priceOf(product);
              return (
                <>
                  <span className="text-base font-bold text-brand-ink">₹{price}</span>

                  {was && (
                    <span className="text-sm text-gray-400 line-through">
                      {wasIsMrp && <span className="text-[10px] mr-0.5">M.R.P.</span>}₹{was}
                    </span>
                  )}

                  {percentOff > 0 && (
                    <span className="text-xs font-semibold text-positive">
                      {percentOff}% off
                    </span>
                  )}
                </>
              );
            })()}
          </div>

          <span className="text-[11px] text-gray-500 shrink-0">
            Stock: {product.stock}
          </span>
        </div>
      </div>

      {/*
        ACTIONS

        Once something is in the cart the button becomes a stepper rather than
        a red "Remove from Cart". Red means destroying something, and taking an
        item back out of a basket is neither destructive nor final - it is the
        adjustment a shopper makes most often. The cart page has had this
        stepper all along; the card is where the decision is actually made.
      */}
      <div className="mt-3 px-3 pb-3 flex flex-col gap-2">
        {qty === 0 ? (
          <Button variant="primary" fullWidth onClick={() => changeQty(1)}>
            Add to cart
          </Button>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-brand-700 overflow-hidden">
            <button
              type="button"
              onClick={() => changeQty(qty - 1)}
              aria-label={qty === 1 ? 'Remove from cart' : 'One fewer'}
              className="px-3 py-2 text-brand-ink hover:bg-brand-50
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              <Minus size={16} />
            </button>

            <span className="text-sm font-medium tabular-nums" aria-live="polite">
              {qty} in cart
            </span>

            <button
              type="button"
              onClick={() => changeQty(qty + 1)}
              disabled={qty >= product.stock}
              aria-label="One more"
              title={qty >= product.stock ? `Only ${product.stock} left` : undefined}
              className="px-3 py-2 text-brand-ink hover:bg-brand-50 disabled:opacity-40
                         disabled:cursor-not-allowed
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700"
            >
              <Plus size={16} />
            </button>
          </div>
        )}

        {/* The canonical URL. This linked by _id, so every internal link
            pointed somewhere other than the address in the sitemap. */}
        <Button as={Link} to={`/products/${product.slug || product._id}`} variant="secondary" fullWidth>
          View details
        </Button>
      </div>
    </div>
  );
}
