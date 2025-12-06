import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import { getCart } from '../../services/cartService';
import { getAddresses } from '../../services/addressService';
import { checkoutOrder } from '../../services/orderService';
import { useNavigate } from 'react-router-dom';

export default function CheckoutPage() {
  const [cart, setCart] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [cartRes, addrRes] = await Promise.all([
          getCart(),
          getAddresses(),
        ]);

        const c = cartRes.data.cart;
        setCart(c);

        const list = addrRes.data.addresses || [];
        setAddresses(list);

        const def = list.find((a) => a.isDefault);
        if (def) setSelectedAddressId(def._id);
        else if (list[0]) setSelectedAddressId(list[0]._id);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      alert('Please select a shipping address');
      return;
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      alert('Cart is empty');
      return;
    }

    try {
      setPlacing(true);
      const res = await checkoutOrder(selectedAddressId);
      if (res.data.order?._id) {
        navigate('/customer/orders');
      } else {
        alert('Order placed but response invalid');
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Checkout">
        <p>Loading...</p>
      </Layout>
    );
  }

  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <Layout title="Checkout">
        <div className="bg-white p-6 rounded shadow max-w-xl">
          <h2 className="text-lg font-semibold mb-2">Your cart is empty</h2>
          <p className="text-sm text-gray-600 mb-4">
            Add some products to your cart before checking out.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Checkout">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-semibold mb-3">1. Review Items</h2>
            <div className="space-y-3">
              {cart.items.map((item) => (
                <div
                  key={item.productId._id}
                  className="flex justify-between items-center border-b pb-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.productId.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Qty: {item.quantity} × ₹{item.price}
                    </p>
                  </div>
                  <p className="text-sm font-semibold">
                    ₹{item.quantity * item.price}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between items-center border-t pt-3">
              <span className="font-semibold text-sm">Items total</span>
              <span className="font-bold text-lg">₹{cart.totalAmount}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-semibold mb-3">2. Shipping Address</h2>
            {addresses.length === 0 && (
              <p className="text-sm text-gray-600">
                You have no saved addresses. Please add one from “My Addresses”
                section.
              </p>
            )}

            {addresses.length > 0 && (
              <div className="space-y-3">
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                >
                  {addresses.map((addr) => (
                    <option key={addr._id} value={addr._id}>
                      {addr.label} – {addr.city}, {addr.state}
                    </option>
                  ))}
                </select>

                <div className="text-xs text-gray-700 bg-gray-50 p-3 rounded">
                  {(() => {
                    const sel = addresses.find(
                      (a) => a._id === selectedAddressId
                    );
                    if (!sel) return null;
                    return (
                      <>
                        <p className="font-semibold text-sm">
                          {sel.label}
                          {sel.isDefault && (
                            <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1 rounded">
                              Default
                            </span>
                          )}
                        </p>
                        <p>{sel.street}</p>
                        <p>
                          {sel.city}, {sel.state} - {sel.zipCode}
                        </p>
                        <p>{sel.country}</p>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow h-fit">
          <h2 className="text-lg font-semibold mb-3">3. Payment</h2>
          <p className="text-sm text-gray-600 mb-4">
            Payment integration abhi dummy hai. Click “Place Order” to complete
            the order with COD.
          </p>
          <div className="flex justify-between mb-2 text-sm">
            <span>Items total</span>
            <span>₹{cart.totalAmount}</span>
          </div>
          <div className="flex justify-between mb-4 text-sm font-semibold">
            <span>Grand total</span>
            <span>₹{cart.totalAmount}</span>
          </div>
          <button
            onClick={handlePlaceOrder}
            disabled={placing || addresses.length === 0}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2 rounded text-sm disabled:opacity-60"
          >
            {placing ? 'Placing order...' : 'Place Order'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
