// src/pages/customer/MyOrdersPage.jsx

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
  const [cancellingItemId, setCancellingItemId] = useState(null); // ✅ NEW: Track cancelling state

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await getMyOrders();
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error("GET MY ORDERS ERROR", err);
      toastError(err?.response?.data?.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // ✅ EXISTING: Cancel item function (unchanged)
  const handleCancelItem = async (orderId, itemId, itemName) => {
    if (!window.confirm(`Cancel "${itemName}" from this order?`)) {
      return;
    }
    try {
      setCancellingItemId(itemId);
      await cancelOrderItem(orderId, itemId);
      toastSuccess("Item cancelled successfully");
      await fetchOrders();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to cancel item";
      toastError(msg);
    } finally {
      setCancellingItemId(null);
    }
  };

  if (loading) {
    return (
      <Layout title="My Orders">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="My Orders">
      <div className="max-w-5xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">My Orders ({orders.length})</h1>

        {orders.length === 0 ? (
          <div className="bg-white border rounded p-8 text-center">
            <p className="text-gray-600 mb-4">
              You have not placed any orders yet.
            </p>
            <Link
              to="/shop"
              className="inline-block px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const orderTotal = order.totalAmount || 0;
              const shippingCharges = order.shippingCharges || 0;
              const itemsTotal = orderTotal - shippingCharges;

              return (
                <div
                  key={order._id}
                  className="bg-white border rounded p-4 shadow-sm space-y-3"
                >
                  {/* Top summary row */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b">
                    <div>
                      <p className="text-sm font-semibold">
                        Order ID: {order._id}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>

                      {/* Pricing breakdown */}
                      <div className="mt-2 text-xs space-y-1">
                        <p className="text-gray-600">
                          Items:{" "}
                          <span className="font-medium text-gray-800">
                            ₹{itemsTotal}
                          </span>
                        </p>

                        <p className="text-gray-600">
                          Shipping:{" "}
                          <span className="font-medium text-green-600">
                            ₹{shippingCharges}
                          </span>
                          {order.shippingCourierName && (
                            <span className="ml-1 text-[10px] bg-blue-50 text-blue-600 px-1 rounded">
                              via {order.shippingCourierName}
                            </span>
                          )}
                        </p>

                        <p className="text-sm font-bold">
                          Total:{" "}
                          <span className="text-orange-600">₹{orderTotal}</span>
                        </p>
                      </div>

                      {order.shippingAddressId && (
                        <p className="text-xs text-gray-500 mt-2">
                          📍 Delivering to {order.shippingAddressId.city},{" "}
                          {order.shippingAddressId.state} -{" "}
                          {order.shippingAddressId.zipCode}
                        </p>
                      )}

                      {/* Payment method badge */}
                      <div className="mt-2">
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            order.paymentMethod === "cod"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-green-50 text-green-700"
                          }`}
                        >
                          {order.paymentMethod === "cod"
                            ? "Cash on Delivery"
                            : "Online Payment"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-3 py-1 rounded-full capitalize font-medium ${
                          statusColors[order.status] ||
                          "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {order.status}
                      </span>

                      <Link
                        to={`/customer/orders/${order._id}`}
                        className="text-xs text-orange-600 hover:underline whitespace-nowrap"
                      >
                        View Details →
                      </Link>
                    </div>
                  </div>

                  {/* Items preview with cancel button - ✅ NEW */}
                  <div className="space-y-2">
                    {order.items.slice(0, 2).map((item) => (
                      <div
                        key={item._id}
                        className={`flex gap-3 items-center ${
                          item.status === "cancelled" ? "opacity-50" : ""
                        }`}
                      >
                        <div className="w-12 h-12 bg-gray-100 rounded flex-shrink-0 flex items-center justify-center text-xs text-gray-400">
                          📦
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            Qty: {item.quantity} × ₹{item.price}
                            {item.status === "cancelled" && (
                              <span className="ml-1 text-[10px] text-red-500">
                                (cancelled)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">
                            ₹{item.price * item.quantity}
                          </p>

                          {/* ✅ NEW: Cancel Item Button */}
                          {order.status !== "delivered" &&
                            order.status !== "cancelled" &&
                            order.status !== "returned" &&
                            item.status !== "cancelled" && (
                              <button
                                onClick={() =>
                                  handleCancelItem(order._id, item._id, item.name)
                                }
                                disabled={cancellingItemId === item._id}
                                className="text-[10px] text-red-600 hover:underline disabled:opacity-50 whitespace-nowrap"
                              >
                                {cancellingItemId === item._id
                                  ? "Cancelling..."
                                  : "Cancel"}
                              </button>
                            )}
                        </div>
                      </div>
                    ))}

                    {order.items.length > 2 && (
                      <p className="text-xs text-gray-500 text-right">
                        +{order.items.length - 2} more item(s)
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
