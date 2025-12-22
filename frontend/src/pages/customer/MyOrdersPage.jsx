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
          <div className="bg-white border rounded p-8 text-center">
            <p className="text-gray-600 mb-4">You have not placed any orders yet.</p>
            <Link 
              to="/customer/products" 
              className="inline-block px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              // ✅ Calculate pricing breakdown
              const itemsTotal = order.items.reduce((sum, item) => {
                return sum + (item.price * item.quantity);
              }, 0);
              const shippingCharges = order.shippingCharges || 0;
              const orderTotal = order.totalAmount;

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
                      
                      {/* ✅ ENHANCED PRICING DISPLAY */}
                      <div className="mt-2 text-xs space-y-1">
                        <p className="text-gray-600">
                          Items: <span className="font-medium text-gray-800">₹{itemsTotal}</span>
                        </p>
                        {shippingCharges > 0 && (
                          <p className="text-gray-600">
                            Shipping: <span className="font-medium text-green-600">₹{shippingCharges}</span>
                            {order.shippingCourierName && (
                              <span className="ml-1 text-[10px] bg-blue-50 text-blue-600 px-1 rounded">
                                via {order.shippingCourierName}
                              </span>
                            )}
                          </p>
                        )}
                        <p className="text-sm font-bold">
                          Total: <span className="text-orange-600">₹{orderTotal}</span>
                        </p>
                      </div>

                      {order.shippingAddressId && (
                        <p className="text-xs text-gray-500 mt-2">
                          📍 Delivering to: {order.shippingAddressId.city},{" "}
                          {order.shippingAddressId.state} - {order.shippingAddressId.zipCode}
                        </p>
                      )}

                      {/* ✅ Payment Method Badge */}
                      <div className="mt-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          order.paymentMethod === 'cod' 
                            ? 'bg-amber-50 text-amber-700' 
                            : 'bg-green-50 text-green-700'
                        }`}>
                          {order.paymentMethod === 'cod' ? '💵 Cash on Delivery' : '💳 Online Payment'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-3 py-1 rounded-full capitalize font-medium ${
                          statusColors[order.status]
                        }`}
                      >
                        {order.status}
                      </span>

                      <Link
                        to={`/customer/orders/${order._id}`}
                        className="text-sm text-orange-600 hover:underline font-medium"
                      >
                        View Details →
                      </Link>
                    </div>
                  </div>

                  {/* Items + per-item cancel */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Order Items</p>
                    {order.items.map((item) => (
                      <div
                        key={item._id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm p-2 bg-gray-50 rounded"
                      >
                        <div>
                          <p className="font-medium">
                            {item.name}{" "}
                            {item.status === "cancelled" && (
                              <span className="text-xs text-red-500 font-semibold">
                                (Cancelled)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            Qty: {item.quantity} • Price: ₹{item.price} • Subtotal: ₹{item.price * item.quantity}
                          </p>
                        </div>

                        {["pending", "processing"].includes(order.status) &&
                          (item.status === "active" || !item.status) && (
                            <button
                              onClick={() =>
                                handleCancelItem(order._id, item._id)
                              }
                              className="self-start sm:self-auto text-xs px-3 py-1 rounded border border-red-400 text-red-500 hover:bg-red-50 transition-colors"
                            >
                              Cancel Item
                            </button>
                          )}
                      </div>
                    ))}
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
