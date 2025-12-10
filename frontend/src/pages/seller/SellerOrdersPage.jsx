import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import {
  getSellerOrders,
  updateOrderStatus,
} from "../../services/sellerService";
import {toastSuccess,toastError} from '../../utils/toast'
const statusFlow = ["processing", "shipped", "delivered"];



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
      toastSuccess("Order status updated");
      loadOrders();
    } catch (err) {
      toastError(err.response?.data?.message || "Failed to update status");
    } finally {
      setUpdatingId(null);
    }
  };


const getNextStatus = (current) => {
  // Cancelled / returned par koi aage ka status allowed nahi
  if (["cancelled", "returned"].includes(current)) return null;


  if (current === "pending") return "processing";
  if (current === "processing") return "shipped";
  if (current === "shipped") return "delivered";


  // delivered ke baad bhi koi next status nahi
  return null;
};
const renderStatusLabel = (status, cancelledCount = 0, activeCount = 0) => {
  // Agar sabhi items cancel ho chuke hain
  if (status === "cancelled" || (cancelledCount > 0 && activeCount === 0)) {
    return (
      <span className="text-xs text-red-600 font-semibold">
        ✖ Cancelled
      </span>
    );
  }

  // Order delivered hai, lekin kuch items cancel bhi hue the
  if (status === "delivered" && cancelledCount > 0 && activeCount > 0) {
    return (
      <span className="text-xs text-yellow-600 font-semibold">
        ⚠ Partially fulfilled ({cancelledCount} cancelled)
      </span>
    );
  }

  // Order returned (future ke liye)
  if (status === "returned") {
    return (
      <span className="text-xs text-red-600 font-semibold">
        ↩ Returned
      </span>
    );
  }

  // Normal completed
  if (status === "delivered" && cancelledCount === 0) {
    return (
      <span className="text-xs text-green-600 font-semibold">
        ✔ Completed
      </span>
    );
  }

  // Baaki cases me simple current status text (pending/processing/shipped)
  return (
    <span className="text-xs text-gray-600 font-semibold capitalize">
      {status}
    </span>
  );
};


const renderTimeline = (status) => {
  // Cancelled / returned ke liye timeline na dikhaye, sirf label
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
    type="button"
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
  renderStatusLabel(order.status, cancelledCount, activeCount)
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