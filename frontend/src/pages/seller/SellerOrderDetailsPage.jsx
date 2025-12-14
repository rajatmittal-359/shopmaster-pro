import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/common/Layout";
import { getOrderDetails, updateOrderStatus, updateTracking } from "../../services/sellerService";
import { toastSuccess, toastError } from "../../utils/toast";
import Loader from "../../components/common/Loader";

const statusFlow = ["processing", "shipped", "delivered"];

export default function SellerOrderDetailsPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const res = await getOrderDetails(orderId);
      setOrder(res.data.order);
      
      // Pre-fill tracking if exists
      if (res.data.order.trackingInfo) {
        setCourierName(res.data.order.trackingInfo.courierName || "");
        setTrackingNumber(res.data.order.trackingInfo.trackingNumber || "");
      }
    } catch (err) {
      toastError(err?.response?.data?.message || "Failed to load order");
      navigate("/seller/orders");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (nextStatus) => {
    if (!window.confirm(`Mark order as ${nextStatus}?`)) return;

    try {
      setUpdating(true);
      await updateOrderStatus(orderId, nextStatus);
      toastSuccess("Order status updated");
      loadOrder();
    } catch (err) {
      toastError(err?.response?.data?.message || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleTrackingUpdate = async () => {
    if (!courierName.trim() || !trackingNumber.trim()) {
      toastError("Please enter both courier name and tracking number");
      return;
    }

    try {
      await updateTracking(orderId, { courierName, trackingNumber });
      toastSuccess("Tracking updated");
      loadOrder();
    } catch (err) {
      toastError(err?.response?.data?.message || "Failed to update tracking");
    }
  };

  const getNextStatus = (current) => {
    if (["cancelled", "returned"].includes(current)) return null;
    if (current === "pending") return "processing";
    if (current === "processing") return "shipped";
    if (current === "shipped") return "delivered";
    return null;
  };

  const renderTimeline = (status) => {
    if (["cancelled", "returned"].includes(status)) return null;

    return (
      <div className="flex items-center gap-2 mt-3">
        {statusFlow.map((step, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                statusFlow.indexOf(status) >= idx ? "bg-green-500" : "bg-gray-300"
              }`}
            ></div>
            {idx !== statusFlow.length - 1 && <div className="w-8 h-0.5 bg-gray-300"></div>}
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <Layout title="Order Details"><Loader /></Layout>;

  if (!order) {
    return (
      <Layout title="Order Details">
        <p className="text-red-600 text-sm">Order not found.</p>
      </Layout>
    );
  }

  const nextStatus = getNextStatus(order.status);

  return (
    <Layout title="Order Details">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Order #{order._id.slice(-6)}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => navigate("/seller/orders")}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
          >
            Back to Orders
          </button>
        </div>

        {/* Customer Info */}
        <div className="bg-white p-4 rounded shadow border">
          <h3 className="font-semibold mb-2">Customer Details</h3>
          <p className="text-sm text-gray-700">
            <strong>Name:</strong> {order.customerId?.name || "N/A"}
          </p>
          <p className="text-sm text-gray-700">
            <strong>Email:</strong> {order.customerId?.email || "N/A"}
          </p>
        </div>

        {/* Shipping Address */}
        {order.shippingAddressId && (
          <div className="bg-white p-4 rounded shadow border">
            <h3 className="font-semibold mb-2">Shipping Address</h3>
            <p className="text-sm text-gray-700">
              {order.shippingAddressId.addressLine1}
              {order.shippingAddressId.addressLine2 && `, ${order.shippingAddressId.addressLine2}`}
            </p>
            <p className="text-sm text-gray-700">
              {order.shippingAddressId.city}, {order.shippingAddressId.state} -{" "}
              {order.shippingAddressId.pincode}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Phone:</strong> {order.shippingAddressId.phone}
            </p>
          </div>
        )}

        {/* Order Items */}
        <div className="bg-white p-4 rounded shadow border">
          <h3 className="font-semibold mb-3">Order Items</h3>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item._id} className="flex justify-between items-center border-b pb-2">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-gray-600">
                    Qty: {item.quantity} × ₹{item.price}
                  </p>
                </div>
                <p className="text-sm font-semibold">₹{item.quantity * item.price}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Status & Timeline */}
        <div className="bg-white p-4 rounded shadow border">
          <h3 className="font-semibold mb-2">Order Status</h3>
          <div className="flex justify-between items-center">
            <span className="text-sm capitalize font-medium">{order.status}</span>
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded capitalize">
              Payment: {order.paymentStatus}
            </span>
          </div>
          {renderTimeline(order.status)}

          {/* Next Status Button */}
          {nextStatus && (
            <div className="mt-4">
              <button
                onClick={() => handleStatusUpdate(nextStatus)}
                disabled={updating}
                className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded disabled:opacity-60"
              >
                {updating ? "Updating..." : `Mark as ${nextStatus}`}
              </button>
            </div>
          )}
        </div>

        {/* Tracking Info */}
        <div className="bg-white p-4 rounded shadow border">
          <h3 className="font-semibold mb-3">Tracking Information</h3>
          
          {order.trackingInfo?.courierName && (
            <div className="mb-3 text-sm">
              <p><strong>Courier:</strong> {order.trackingInfo.courierName}</p>
              <p><strong>Tracking:</strong> {order.trackingInfo.trackingNumber}</p>
              {order.trackingInfo.shippedDate && (
                <p className="text-xs text-gray-500 mt-1">
                  Shipped: {new Date(order.trackingInfo.shippedDate).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <input
              type="text"
              placeholder="Courier Name (e.g., Delhivery)"
              value={courierName}
              onChange={(e) => setCourierName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Tracking Number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            <button
              onClick={handleTrackingUpdate}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded text-sm"
            >
              Update Tracking
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
