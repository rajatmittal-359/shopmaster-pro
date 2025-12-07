import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import {
  getSellerOrders,
  updateOrderStatus,
} from "../../services/sellerService";

const statusFlow = ["pending", "processing", "shipped", "delivered"];

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await getSellerOrders();
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error("Failed to load seller orders", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusUpdate = async (orderId, nextStatus) => {
    if (!window.confirm(`Mark order as ${nextStatus}?`)) return;

    try {
      setUpdatingId(orderId);
      await updateOrderStatus(orderId, nextStatus);
      alert("Order status updated");
      loadOrders();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  const getNextStatus = (current) => {
    const idx = statusFlow.indexOf(current);
    return idx < statusFlow.length - 1 ? statusFlow[idx + 1] : null;
  };

  const renderTimeline = (status) => {
    return (
      <div className="flex items-center gap-2 mt-2">
        {statusFlow.map((step, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                statusFlow.indexOf(status) >= idx
                  ? "bg-green-500"
                  : "bg-gray-300"
              }`}
            />
            {idx !== statusFlow.length - 1 && (
              <div className="w-8 h-0.5 bg-gray-300" />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <Layout title="Seller Orders">
      <h2 className="text-2xl font-bold mb-5">Seller Orders</h2>

      {loading && <p>Loading orders...</p>}

      {!loading && orders.length === 0 && (
        <p className="text-sm text-gray-600">No orders received yet.</p>
      )}

      {!loading && orders.length > 0 && (
        <div className="space-y-5">
          {orders.map((order) => {
            const nextStatus = getNextStatus(order.status);

            return (
              <div
                key={order._id}
                className="bg-white p-5 rounded shadow border"
              >
                {/* HEADER */}
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-semibold">
                    Order #{order._id.slice(-6)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(order.createdAt).toLocaleString()}
                  </span>
                </div>

                {/* CUSTOMER */}
                <p className="text-xs text-gray-600 mb-2">
                  Customer:{" "}
                  <span className="font-medium">
                    {order.customerId?.name || "User"}
                  </span>{" "}
                  ({order.customerId?.email})
                </p>

                {/* ITEMS */}
                <div className="text-xs text-gray-700 space-y-1">
                  {order.items.map((item) => (
                    <p key={item._id}>
                      {item.name} × {item.quantity} — ₹{item.price}
                    </p>
                  ))}
                </div>

                {/* TIMELINE */}
                {renderTimeline(order.status)}

                {/* INFO */}
                <div className="flex justify-between items-center text-sm mt-3">
                  <span className="font-semibold">
                    Payment:{" "}
                    <span className="capitalize">
                      {order.paymentStatus}
                    </span>
                  </span>

                  <span className="capitalize text-xs">
                    Status: {order.status}
                  </span>
                </div>

                {/* ACTION */}
                <div className="flex justify-end mt-4">
                  {nextStatus ? (
                    <button
                      onClick={() =>
                        handleStatusUpdate(order._id, nextStatus)
                      }
                      disabled={updatingId === order._id}
                      className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded disabled:opacity-60"
                    >
                      {updatingId === order._id
                        ? "Updating..."
                        : `Mark as ${nextStatus}`}
                    </button>
                  ) : (
                    <span className="text-xs text-green-600 font-semibold">
                      ✔ Completed
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
