import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import {
  getSellerOrders,
  updateOrderStatus,
  updateTracking,
} from "../../services/sellerService";
import { toastSuccess, toastError } from "../../utils/toast";
import { Link } from "react-router-dom";

const statusFlow = ["processing", "shipped", "delivered"];

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [trackingData, setTrackingData] = useState({}); // Per-order tracking state

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

  const handleTrackingUpdate = async (orderId) => {
    const data = trackingData[orderId];
    if (!data?.courierName?.trim() || !data?.trackingNumber?.trim()) {
      toastError("Please enter both courier name and tracking number");
      return;
    }

    try {
      await updateTracking(orderId, {
        courierName: data.courierName,
        trackingNumber: data.trackingNumber,
      });
      toastSuccess("Tracking updated");
      
      // Clear tracking inputs for this order
      setTrackingData((prev) => ({
        ...prev,
        [orderId]: { courierName: "", trackingNumber: "" },
      }));
      
      loadOrders();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to update tracking");
    }
  };

  const handleStatusUpdate = async (orderId, nextStatus) => {
    if (!window.confirm(`Mark order as ${nextStatus}?`)) return;

    try {
      setUpdatingId(orderId);
      await updateOrderStatus(orderId, nextStatus);
      toastSuccess("Order status updated");
      loadOrders();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };

  const updateTrackingField = (orderId, field, value) => {
    setTrackingData((prev) => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value,
      },
    }));
  };

  const getNextStatus = (current) => {
    if (["cancelled", "returned"].includes(current)) return null;
    if (current === "pending") return "processing";
    if (current === "processing") return "shipped";
    if (current === "shipped") return "delivered";
    return null;
  };

  const renderStatusLabel = (status, cancelledCount = 0, activeCount = 0) => {
    if (status === "cancelled" || (cancelledCount > 0 && activeCount === 0)) {
      return (
        <span className="text-xs text-red-600 font-semibold">✖ Cancelled</span>
      );
    }

    if (status === "delivered" && cancelledCount > 0 && activeCount > 0) {
      return (
        <span className="text-xs text-yellow-600 font-semibold">
          ⚠ Partially fulfilled ({cancelledCount} cancelled)
        </span>
      );
    }

    if (status === "returned") {
      return (
        <span className="text-xs text-red-600 font-semibold">↩ Returned</span>
      );
    }

    if (status === "delivered" && cancelledCount === 0) {
      return (
        <span className="text-xs text-green-600 font-semibold">
          ✔ Completed
        </span>
      );
    }

    return (
      <span className="text-xs text-gray-600 font-semibold capitalize">
        {status}
      </span>
    );
  };

  const renderTimeline = (status) => {
    if (["cancelled", "returned"].includes(status)) return null;

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
            const cancelledCount = order.items.filter(
              (it) => it.status === "cancelled"
            ).length;
            const activeCount = order.items.filter(
              (it) => it.status === "active"
            ).length;

            return (
              <div
                key={order._id}
                className="bg-white p-5 rounded shadow border"
              >
                {/* HEADER */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="font-semibold text-sm">
                      Order #{order._id.slice(-6)}
                    </span>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  
                  {/* VIEW DETAILS BUTTON */}
                  <Link
                    to={`/seller/orders/${order._id}`}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition"
                  >
                    View Full Details →
                  </Link>
                </div>

                {/* CUSTOMER */}
                <p className="text-xs text-gray-600 mb-2">
                  Customer:{" "}
                  <span className="font-medium">
                    {order.customerId?.name || "User"}
                  </span>{" "}
                  ({order.customerId?.email})
                </p>

                {/* TRACKING INFO */}
                {order.trackingInfo && (
                  <div className="mt-2 text-xs bg-blue-50 p-2 rounded border border-blue-200">
                    <p>
                      <strong>Courier:</strong> {order.trackingInfo.courierName}
                    </p>
                    <p>
                      <strong>Tracking:</strong>{" "}
                      {order.trackingInfo.trackingNumber}
                    </p>
                    {order.trackingInfo.shippedDate && (
                      <p>
                        <strong>Shipped:</strong>{" "}
                        {new Date(
                          order.trackingInfo.shippedDate
                        ).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}

                {/* ITEMS */}
                <div className="text-xs text-gray-700 space-y-1 mt-3">
                  {order.items.map((item) => (
                    <p key={item._id}>
                      {item.name} × {item.quantity} — ₹{item.price}{" "}
                      {item.status === "cancelled" && (
                        <span className="text-red-600">(cancelled)</span>
                      )}
                    </p>
                  ))}
                </div>

                {/* TIMELINE */}
                {renderTimeline(order.status)}

                {/* INFO */}
                <div className="flex justify-between items-center text-sm mt-3">
                  <span className="font-semibold">
                    Payment:{" "}
                    <span className="capitalize">{order.paymentStatus}</span>
                  </span>

                  <span className="capitalize text-xs">
                    Status: {order.status}
                  </span>
                </div>

                {/* ACTION */}
                <div className="flex justify-end mt-4">
                  {nextStatus ? (
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate(order._id, nextStatus)}
                      disabled={updatingId === order._id}
                      className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs rounded disabled:opacity-60"
                    >
                      {updatingId === order._id
                        ? "Updating..."
                        : `Mark as ${nextStatus}`}
                    </button>
                  ) : (
                    renderStatusLabel(order.status, cancelledCount, activeCount)
                  )}
                </div>

                {/* TRACKING UPDATE */}
                <div className="mt-4 border-t pt-3">
                  <h4 className="text-xs font-semibold mb-2">
                    Update Tracking
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Courier (e.g., Delhivery)"
                      value={trackingData[order._id]?.courierName || ""}
                      onChange={(e) =>
                        updateTrackingField(
                          order._id,
                          "courierName",
                          e.target.value
                        )
                      }
                      className="flex-1 px-2 py-1 border rounded text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Tracking No."
                      value={trackingData[order._id]?.trackingNumber || ""}
                      onChange={(e) =>
                        updateTrackingField(
                          order._id,
                          "trackingNumber",
                          e.target.value
                        )
                      }
                      className="flex-1 px-2 py-1 border rounded text-xs"
                    />
                    <button
                      onClick={() => handleTrackingUpdate(order._id)}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      Update
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
