import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import { getMyOrders, cancelOrder } from '../../services/orderService';

export default function MyOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await getMyOrders();
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleCancel = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await cancelOrder(orderId);
      loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order');
    }
  };

  return (
    <Layout title="My Orders">
      <h2 className="text-2xl font-bold mb-4">My Orders</h2>
      {loading && <p>Loading...</p>}
      {!loading && orders.length === 0 && (
        <p className="text-sm text-gray-600">No orders yet.</p>
      )}
      {!loading && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order._id}
              className="bg-white p-4 rounded shadow border flex flex-col gap-2"
            >
              <div className="flex justify-between text-sm">
                <span className="font-semibold">
                  Order #{order._id.slice(-6)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(order.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="text-xs text-gray-600">
                {order.items.map((item) => (
                  <p key={item._id}>
                    {item.name} × {item.quantity} – ₹{item.price}
                  </p>
                ))}
              </div>

              <div className="flex justify-between items-center text-sm mt-1">
                <span className="font-semibold">
                  Total: ₹{order.totalAmount}
                </span>
                <span className="text-xs capitalize">
                  Status: {order.status} | Payment: {order.paymentStatus}
                </span>
              </div>

              {['pending', 'processing'].includes(order.status) && (
                <button
                  onClick={() => handleCancel(order._id)}
                  className="self-end mt-1 text-xs text-red-600 hover:underline"
                >
                  Cancel order
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
