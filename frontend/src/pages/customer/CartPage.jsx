import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../../components/common/Layout';
import api from '../../utils/api';

export default function CartPage() {
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
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (productId, quantity) => {
    if (quantity < 1) return;
    try {
      await api.patch('/customer/cart', { productId, quantity });
      loadCart();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update');
    }
  };

  const removeItem = async (productId) => {
    try {
      await api.delete(`/customer/cart/${productId}`);
      loadCart();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove');
    }
  };

  const clearCart = async () => {
    if (!window.confirm('Clear entire cart?')) return;
    try {
      await api.delete('/customer/cart');
      loadCart();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to clear');
    }
  };

  if (loading)
    return (
      <Layout title="My Cart">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </Layout>
    );

  if (!cart || cart.items.length === 0) {
    return (
      <Layout title="My Cart">
        <div className="bg-white rounded shadow p-8 text-center">
          <p className="text-gray-600 mb-4">Your cart is empty</p>
          <Link
            to="/shop"   // ✅ public shop
            className="inline-block px-6 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
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
            <div key={item.productId._id} className="bg-white rounded shadow p-4">
              <div className="flex gap-4">
                {/* Product Image */}
                <div className="w-24 h-24 bg-gray-200 rounded flex-shrink-0">
                  {item.productId.images?.[0] ? (
                    <img
                      src={item.productId.images[0]}
                      alt={item.productId.name}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                      No Image
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1">
                  <h3 className="font-semibold">{item.productId.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {item.productId.description?.substring(0, 80)}...
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Price: ₹{item.price}
                  </p>
                </div>

                {/* Quantity + Remove */}
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => removeItem(item.productId._id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>

                  <div className="flex items-center gap-2 border rounded">
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
                    <button
                      onClick={() =>
                        updateQuantity(item.productId._id, item.quantity + 1)
                      }
                      className="px-2 py-1 hover:bg-gray-100"
                    >
                      +
                    </button>
                  </div>

                  <p className="font-bold text-orange-600">
                    ₹{item.price * item.quantity}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Cart Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded shadow p-4 sticky top-4">
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
              className="w-full bg-orange-500 text-white py-3 rounded font-semibold hover:bg-orange-600"
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
