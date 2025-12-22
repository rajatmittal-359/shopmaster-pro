import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import { getSellerOrders, updateOrderStatus, updateTracking } from '../../services/sellerService';
import { toastSuccess, toastError } from '../../utils/toast';
import { Link } from 'react-router-dom';

const statusFlow = ['processing', 'shipped', 'delivered'];

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  shipped: 'bg-purple-100 text-purple-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  returned: 'bg-gray-100 text-gray-700',
};

const paymentColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
};

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [trackingData, setTrackingData] = useState({}); // Per-order tracking state

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await getSellerOrders();
      setOrders(res.data.orders);
    } catch (err) {
      console.error('Failed to load seller orders', err);
      toastError(err?.response?.data?.message || 'Failed to load orders');
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
      toastError('Please enter both courier name and tracking number');
      return;
    }

    try {
      await updateTracking(orderId, {
        courierName: data.courierName,
        trackingNumber: data.trackingNumber,
      });
      toastSuccess('Tracking updated');
      // Clear tracking inputs for this order
      setTrackingData((prev) => ({
        ...prev,
        [orderId]: { courierName: '', trackingNumber: '' },
      }));
      loadOrders();
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed to update tracking');
    }
  };

  const handleStatusUpdate = async (orderId, nextStatus) => {
    if (!window.confirm(`Mark order as ${nextStatus}?`)) return;

    try {
      setUpdatingId(orderId);
      await updateOrderStatus(orderId, nextStatus);
      toastSuccess('Order status updated');
      loadOrders();
    } catch (err) {
      toastError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const updateTrackingField = (orderId, field, value) => {
    setTrackingData((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] || {}),
        [field]: value,
      },
    }));
  };

  const getNextStatus = (current) => {
    if (['cancelled', 'returned'].includes(current)) return null;
    if (current === 'pending') return 'processing';
    if (current === 'processing') return 'shipped';
    if (current === 'shipped') return 'delivered';
    return null;
  };

  // ✅ Calculate seller-specific revenue
  const calculateSellerRevenue = (order) => {
    return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  };

  const renderTimeline = (status) => {
    if (['cancelled', 'returned'].includes(status)) return null;

    return (
      <div className="flex items-center gap-2 mt-2">
        {statusFlow.map((step, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                statusFlow.indexOf(status) >= idx ? 'bg-green-500' : 'bg-gray-300'
              }`}
            ></div>
            {idx !== statusFlow.length - 1 && <div className="w-8 h-0.5 bg-gray-300"></div>}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <Layout title="Seller Orders">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Seller Orders">
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">My Orders</h2>

        {orders.length === 0 ? (
          <p className="text-sm text-gray-600">No orders received yet.</p>
        ) : (
          <div className="space-y-5">
            {orders.map((order) => {
              const nextStatus = getNextStatus(order.status);
              const sellerRevenue = calculateSellerRevenue(order);

              return (
                <div key={order._id} className="bg-white p-5 rounded shadow border space-y-4">
                  {/* ✅ HEADER */}
                  <div className="flex flex-col md:flex-row md:justify-between gap-3 pb-3 border-b">
                    <div>
                      <span className="font-semibold text-sm">
                        Order #{order._id.slice(-6)}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded text-xs font-medium capitalize ${
                          statusColors[order.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {order.status}
                      </span>
                      <span
                        className={`px-3 py-1 rounded text-xs font-medium capitalize ${
                          paymentColors[order.paymentStatus] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {order.paymentStatus}
                      </span>
                    </div>
                  </div>

                  {/* ✅ CUSTOMER INFO */}
                  <div className="text-xs text-gray-700">
                    <p>
                      <span className="font-medium">Customer:</span>{' '}
                      {order.customerId?.name || 'N/A'}
                    </p>
                    <p className="text-gray-500">{order.customerId?.email || 'N/A'}</p>
                  </div>

                  {/* ✅ ITEMS */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600">Items in this order:</p>
                    {order.items.map((item) => (
                      <div
                        key={item._id}
                        className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded"
                      >
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-gray-600">
                            Qty: {item.quantity} × ₹{item.price}
                          </p>
                          {item.status === 'cancelled' && (
                            <span className="text-red-600 font-semibold">(Cancelled)</span>
                          )}
                        </div>
                        <p className="font-bold">₹{item.price * item.quantity}</p>
                      </div>
                    ))}
                  </div>

                  {/* ✅ REVENUE BREAKDOWN */}
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-700">Your Revenue (Items):</span>
                      <span className="font-bold text-blue-700">₹{sellerRevenue}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Payment Method:</span>
                      <span className="font-medium capitalize">
                        {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online'}
                      </span>
                    </div>
                    {order.paymentStatus === 'completed' && (
                      <p className="text-xs text-green-700 font-semibold">
                        ✓ Payment Collected
                      </p>
                    )}
                  </div>

                  {/* ✅ TRACKING INFO */}
                  {order.trackingInfo?.courierName && (
                    <div className="bg-purple-50 border border-purple-200 rounded p-3 text-xs">
                      <p className="font-semibold mb-1">Tracking Information:</p>
                      <p>
                        <strong>Courier:</strong> {order.trackingInfo.courierName}
                      </p>
                      <p>
                        <strong>Tracking:</strong> {order.trackingInfo.trackingNumber}
                      </p>
                      {order.trackingInfo.shippedDate && (
                        <p className="text-gray-600">
                          Shipped: {new Date(order.trackingInfo.shippedDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* ✅ ACTIONS */}
                  <div className="flex flex-col md:flex-row gap-3">
                    {/* View Details */}
                    <Link
                      to={`/seller/orders/${order._id}`}
                      className="flex-1 text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                    >
                      View Full Details
                    </Link>

                    {/* Update Status */}
                    {nextStatus && (
                      <button
                        onClick={() => handleStatusUpdate(order._id, nextStatus)}
                        disabled={updatingId === order._id}
                        className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded disabled:opacity-50"
                      >
                        {updatingId === order._id ? 'Updating...' : `Mark as ${nextStatus}`}
                      </button>
                    )}
                  </div>

                  {/* ✅ ADD TRACKING (if not added) */}
                  {['processing', 'shipped'].includes(order.status) &&
                    !order.trackingInfo?.courierName && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                        <p className="text-xs font-semibold mb-2">Add Tracking Info:</p>
                        <div className="flex flex-col md:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Courier Name"
                            value={trackingData[order._id]?.courierName || ''}
                            onChange={(e) =>
                              updateTrackingField(order._id, 'courierName', e.target.value)
                            }
                            className="flex-1 px-3 py-2 border rounded text-sm"
                          />
                          <input
                            type="text"
                            placeholder="Tracking Number"
                            value={trackingData[order._id]?.trackingNumber || ''}
                            onChange={(e) =>
                              updateTrackingField(order._id, 'trackingNumber', e.target.value)
                            }
                            className="flex-1 px-3 py-2 border rounded text-sm"
                          />
                          <button
                            onClick={() => handleTrackingUpdate(order._id)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    )}

                  {/* Timeline */}
                  {renderTimeline(order.status)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
