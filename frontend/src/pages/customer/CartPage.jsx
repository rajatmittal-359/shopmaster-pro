import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import api from '../../utils/api';

import { useConfirm } from '../../context/confirmContext';
import { useCart } from '../../context/cartContext';
import { toastError } from '../../utils/toast';

const stripHtml = (html = '') => html.replace(/<[^>]*>/g, '');

export default function CartPage() {
  const confirm = useConfirm();
  // This page writes to the cart directly, so the shared count has to be told
  // or the badge in the header keeps showing the number from before.
  const { refresh: refreshCart } = useCart();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async () => {
    try {
      setLoading(true);
      const res = await api.get('/customer/cart');
      setCart(res.data.cart);
    } catch (err) {
      console.error(err);
      toastError('Could not load your cart');
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (productId, quantity) => {
    if (quantity < 1) return;
    try {
      await api.patch('/customer/cart', { productId, quantity });
      loadCart();
      refreshCart();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not update the quantity');
    }
  };

  const removeItem = async (productId) => {
    try {
      await api.delete(`/customer/cart/${productId}`);
      loadCart();
      refreshCart();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not remove that item');
    }
  };

  const clearCart = async () => {
    const sure = await confirm({
      title: 'Empty your cart?',
      message: 'Everything in it will be removed.',
      confirmLabel: 'Empty cart',
    });
    if (!sure) return;
    try {
      await api.delete('/customer/cart');
      loadCart();
      refreshCart();
    } catch (err) {
      toastError(err.response?.data?.message || 'Could not empty your cart');
    }
  };

  if (loading)
    return (
      <Layout title="My Cart">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded-lg w-1/4" />
          <div className="h-32 bg-gray-200 rounded-lg" />
          <div className="h-32 bg-gray-200 rounded-lg" />
        </div>
      </Layout>
    );

  if (!cart || cart.items.length === 0) {
    return (
      <Layout title="My Cart">
        <div className="bg-white rounded-xl shadow p-8 text-center">
          <p className="text-gray-600 mb-4">Your cart is empty</p>
          <Link
            to="/shop"   // ✅ public shop
            className="inline-block px-6 py-2 bg-brand-fill text-on-brand rounded-lg hover:bg-brand-fill-hover"
          >
            Continue Shopping
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="My Cart">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">
          My Cart ({cart.items.length} items)
        </h2>
        <button
          onClick={clearCart}
          className="text-sm text-red-600 hover:underline"
        >
          Clear Cart
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-3">
          {cart.items.map((item) => (
            <div key={item.productId._id} className="bg-white rounded-xl shadow p-3 sm:p-4">
              {/*
                On a phone this was one unbroken row: a fixed image, a fixed
                quantity box, and the name left to fit in what remained, which
                was a sliver - "Marble / Ganesha / Showpiece" down three lines
                with the description shaved to nothing beside it. The controls
                drop below the name at small widths and sit beside it from sm up.
              */}
              <div className="flex gap-3 sm:gap-4">
                {/* Product Image */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gray-200 rounded-lg flex-shrink-0">
                  {item.productId.images?.[0] ? (
                    <img
                      src={item.productId.images[0]}
                      alt={item.productId.name}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                      No Image
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                {/* Product Info */}
                <div className="min-w-0">
                  <h3 className="font-semibold">{item.productId.name}</h3>
                  {/*
                    Descriptions are stored as HTML, and this printed the raw
                    tags - "<p>Marble Ganesha..." - straight onto the page.
                  */}
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {stripHtml(item.productId.description)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Price: ₹{item.price}
                  </p>
                </div>

                {/* Quantity + Remove */}
                <div className="flex items-center justify-between gap-3 shrink-0
                                sm:flex-col sm:items-end sm:justify-start sm:gap-2">
                  <button
                    onClick={() => removeItem(item.productId._id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>

                  <div className="flex items-center gap-2 border rounded-lg">
                    <button
                      onClick={() =>
                        updateQuantity(item.productId._id, item.quantity - 1)
                      }
                      className="px-2 py-1 hover:bg-gray-100"
                      disabled={item.quantity <= 1}
                    >
                      -
                    </button>
                    <span className="px-3 py-1 text-sm">{item.quantity}</span>
                    {/* Stops at what the seller actually has, rather than
                        letting the customer count up and be refused. */}
                    <button
                      onClick={() =>
                        updateQuantity(item.productId._id, item.quantity + 1)
                      }
                      className="px-2 py-1 hover:bg-gray-100 disabled:opacity-40
                                 disabled:cursor-not-allowed"
                      disabled={item.quantity >= item.productId.stock}
                      title={
                        item.quantity >= item.productId.stock
                          ? `Only ${item.productId.stock} left`
                          : undefined
                      }
                    >
                      +
                    </button>
                  </div>

                  <p className="font-bold text-brand-ink">
                    ₹{item.price * item.quantity}
                  </p>
                </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Cart Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow p-4 sticky top-4">
            <h3 className="font-semibold text-lg mb-3">Order Summary</h3>

<div className="space-y-2 text-sm mb-4">
  <div className="flex justify-between">
    <span>Subtotal ({cart.items.length} items)</span>
    <span>₹{cart.totalAmount}</span>
  </div>

  <div className="flex justify-between">
    <span>Shipping</span>
    <span className="text-xs text-gray-500">
      Calculated at checkout
    </span>
  </div>

  <div className="border-t pt-2 flex justify-between font-bold text-lg">
    <span>Total</span>
    <span>₹{cart.totalAmount}</span> {/* items total only */}
  </div>
</div>


            <button
              onClick={() => navigate('/customer/checkout')}
              className="w-full bg-brand-fill text-on-brand py-3 rounded-lg font-semibold hover:bg-brand-fill-hover"
            >
              Proceed to Checkout
            </button>

            <Link
              to="/shop"   // ✅ public shop
              className="block text-center text-sm text-blue-600 hover:underline mt-3"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
