// frontend/src/pages/customer/MyOrdersPage.jsx
import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { getMyOrders, cancelOrderItem } from "../../services/orderService";
import { Link } from "react-router-dom";
import { toastSuccess, toastError } from "../../utils/toast";

const statusColors = {
  pending: "bg-yellow-100 text-yellow-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-indigo-100 text-indigo-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  returned: "bg-purple-100 text-purple-700",
};

export default function MyOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await getMyOrders();
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error("GET MY ORDERS ERROR:", err);
      toastError(err?.response?.data?.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCancelItem = async (orderId, itemId) => {
    try {
      await cancelOrderItem(orderId, itemId);
      toastSuccess("Item cancelled");
      await fetchOrders();
    } catch (err) {
      const msg = err?.response?.data?.message;
      toastError(msg || "Failed to cancel item");
    }
  };

  if (loading) {
    return (
      <Layout title="My Orders">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="My Orders">
      <div className="max-w-5xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">My Orders</h1>

        {orders.length === 0 ? (
          <p className="text-gray-600">You have not placed any orders yet.</p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order._id}
                className="bg-white border rounded p-4 shadow-sm space-y-3"
              >
                {/* Top summary row */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      Order ID: {order._id}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                    <p className="text-sm mt-1">
                      Total: <strong>₹{order.totalAmount}</strong>
                    </p>
                    {order.shippingAddressId && (
                      <p className="text-xs text-gray-500 mt-1">
                        Delivering to: {order.shippingAddressId.city},{" "}
                        {order.shippingAddressId.state}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded capitalize ${
                        statusColors[order.status]
                      }`}
                    >
                      {order.status}
                    </span>

                    <Link
                      to={`/customer/orders/${order._id}`}
                      className="text-sm text-orange-600 hover:underline"
                    >
                      View Details →
                    </Link>
                  </div>
                </div>

                {/* Items + per-item cancel */}
                <div className="border-t pt-3 space-y-2">
                  {order.items.map((item) => (
                    <div
                      key={item._id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {item.name}{" "}
                          {item.status === "cancelled" && (
                            <span className="text-xs text-red-500">
                              (cancelled)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          Qty: {item.quantity} • Price: ₹{item.price}
                        </p>
                      </div>

                      {["pending", "processing"].includes(order.status) &&
                        (item.status === "active" || !item.status) && (
                          <button
                            onClick={() =>
                              handleCancelItem(order._id, item._id)
                            }
                            className="self-start sm:self-auto text-xs px-2 py-1 rounded border border-red-400 text-red-500 hover:bg-red-50"
                          >
                            Cancel this item
                          </button>
                        )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
