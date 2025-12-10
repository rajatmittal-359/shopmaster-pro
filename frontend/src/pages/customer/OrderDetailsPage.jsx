import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/common/Layout";
import {
  getOrderDetails,
  cancelOrder,
  returnOrder,
} from "../../services/orderService";

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await getOrderDetails(orderId);
        setOrder(res.data.order);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  const handleCancel = async () => {
    if (!window.confirm("Cancel this order?")) return;
    try {
      setActionLoading(true);
      await cancelOrder(orderId);
      navigate("/customer/orders");
    } catch (err) {
      alert(err.response?.data?.message || "Cancel failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!window.confirm("Return this order?")) return;
    try {
      setActionLoading(true);
      await returnOrder(orderId);
      navigate("/customer/orders");
    } catch (err) {
      alert(err.response?.data?.message || "Return failed");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Order">
        <p className="p-6">Loading...</p>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout title="Order">
        <p className="p-6">Order not found</p>
      </Layout>
    );
  }

  return (
    <Layout title="Order Details">
      <div className="max-w-4xl mx-auto p-4 space-y-6">

        {/* ORDER HEADER */}
        <div className="bg-white p-4 rounded shadow">
          <p className="text-sm font-semibold">Order ID: {order._id}</p>
          <p className="text-xs text-gray-500">
            {new Date(order.createdAt).toLocaleString()}
          </p>
          <p className="text-sm mt-2">
            Status: <strong>{order.status}</strong>
          </p>
          <p className="text-sm">
            Payment: <strong>{order.paymentStatus}</strong>
          </p>
        </div>

        {/* ITEMS */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-3">Items</h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div
                key={item.productId?._id || item._id}
                className="flex justify-between items-center border-b pb-2"
              >
                <div className="flex items-center gap-3">
                  {item.productId?.images?.[0] && (
                    <img
                      src={item.productId.images[0]}
                      alt=""
                      className="w-12 h-12 object-cover border rounded"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      ₹{item.price} × {item.quantity}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold">
                  ₹{item.price * item.quantity}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* SHIPPING */}
        <div className="bg-white p-4 rounded shadow">
          <h2 className="font-semibold mb-2">Shipping Address</h2>
          <p className="text-sm">{order.shippingAddressId?.street}</p>
          <p className="text-sm">
            {order.shippingAddressId?.city},{" "}
            {order.shippingAddressId?.state} -{" "}
            {order.shippingAddressId?.zipCode}
          </p>
          <p className="text-sm">{order.shippingAddressId?.country}</p>
        </div>
        {/* TRACKING INFO */}
{order.trackingInfo && (
  <div className="mt-2 text-sm">
    <p><strong>Courier:</strong> {order.trackingInfo.courierName}</p>
    <p><strong>Tracking:</strong> {order.trackingInfo.trackingNumber}</p>
    <p><strong>Shipped:</strong> {new Date(order.trackingInfo.shippedDate).toLocaleDateString()}</p>
  </div>
)}

        {/* TOTAL */}
        <div className="bg-white p-4 rounded shadow flex justify-between font-bold">
          <span>Grand Total</span>
          <span>₹{order.totalAmount}</span>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex gap-4">
          {["pending", "processing"].includes(order.status) && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="px-4 py-2 bg-red-500 text-white rounded"
            >
              Cancel Order
            </button>
          )}

          {order.status === "delivered" && (
            <button
              onClick={handleReturn}
              disabled={actionLoading}
              className="px-4 py-2 bg-purple-500 text-white rounded"
            >
              Return Order
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
