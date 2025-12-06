import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import {
  getSellerOrders,
  updateOrderStatus,
} from '../../services/sellerService';

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await getSellerOrders();
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

  const handleStatusUpdate = async (orderId, status) => {
    try {
      await updateOrderStatus(orderId, status);
      loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
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
              className="bg-white p-4 rounded shadow border"
            >
              <div className="flex justify-between text-sm mb-2">
                <span className="font-semibold">
                  Order #{order._id.slice(-6)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(order.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="text-xs text-gray-600 mb-2">
                Customer: {order.customerId?.name} ({order.customerId?.email})
              </div>

              <div className="text-xs text-gray-600 mb-2">
                {order.items.map((item) => (
                  <p key={item._id}>
                    {item.name} × {item.quantity} – ₹{item.price}
                  </p>
                ))}
              </div>

              <div className="flex justify-between items-center text-sm">
                <span className="capitalize text-xs">
                  Status: <strong>{order.status}</strong> | Payment:{' '}
                  {order.paymentStatus}
                </span>

                {order.status === 'pending' && (
                  <button
                    onClick={() =>
                      handleStatusUpdate(order._id, 'processing')
                    }
                    className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
                  >
                    Mark Processing
                  </button>
                )}

                {order.status === 'processing' && (
                  <button
                    onClick={() => handleStatusUpdate(order._id, 'shipped')}
                    className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                  >
                    Mark Shipped
                  </button>
                )}

                {order.status === 'shipped' && (
                  <button
                    onClick={() =>
                      handleStatusUpdate(order._id, 'delivered')
                    }
                    className="text-xs bg-purple-500 text-white px-2 py-1 rounded hover:bg-purple-600"
                  >
                    Mark Delivered
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
