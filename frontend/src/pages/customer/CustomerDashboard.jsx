// frontend/src/pages/customer/CustomerDashboard.jsx
import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import api from "../../utils/api";
import { Link } from "react-router-dom";

export default function CustomerDashboard() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    activeOrders: 0,
    cartItems: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);

        // Orders + cart parallel
        const [ordersRes, cartRes] = await Promise.all([
          api.get("/customer/orders"),
          api.get("/customer/cart"),
        ]);

        const orders = ordersRes.data.orders || [];
        const cart = cartRes.data.cart || { items: [] };

        const activeStatuses = ["pending", "processing", "shipped"];

        setStats({
          totalOrders: orders.length,
          activeOrders: orders.filter((o) =>
            activeStatuses.includes(o.status)
          ).length,
          cartItems: cart.items.length,
        });

        setRecentOrders(orders.slice(0, 5));
      } catch (err) {
        console.error("CUSTOMER DASHBOARD ERROR:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <Layout title="Customer Dashboard">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Customer Dashboard">
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold mb-1">My Dashboard</h2>
            <p className="text-sm text-gray-600">
              Track your orders, cart, and quick actions from one place.
            </p>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total orders */}
          <div className="bg-white rounded shadow p-4 border-l-4 border-blue-500 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total Orders
              </p>
              <p className="text-3xl font-bold text-blue-600 mt-1">
                {stats.totalOrders}
              </p>
            </div>
            <p className="text-11px text-gray-500 mt-1">
              All orders placed using your account.
            </p>
          </div>

          {/* Active orders */}
          <div className="bg-white rounded shadow p-4 border-l-4 border-emerald-500 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Orders in Progress
              </p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">
                {stats.activeOrders}
              </p>
            </div>
            <p className="text-11px text-gray-500 mt-1">
              Pending, processing, or shipped orders.
            </p>
          </div>

          {/* Cart items */}
          <div className="bg-white rounded shadow p-4 border-l-4 border-orange-500 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Items in Cart
              </p>
              <p className="text-3xl font-bold text-orange-600 mt-1">
                {stats.cartItems}
              </p>
            </div>
            <p className="text-11px text-gray-500 mt-1">
              Items waiting to be checked out.
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            to="/shop"
            className="bg-orange-500 text-white rounded shadow p-4 text-center hover:bg-orange-600 transition"
          >
            <p className="font-semibold text-sm">Browse Products</p>
            <p className="text-xs mt-1">Explore our latest catalog.</p>
          </Link>

          <Link
            to="/customer/orders"
            className="bg-blue-500 text-white rounded shadow p-4 text-center hover:bg-blue-600 transition"
          >
            <p className="font-semibold text-sm">My Orders</p>
            <p className="text-xs mt-1">View and track your orders.</p>
          </Link>

          <Link
            to="/customer/addresses"
            className="bg-emerald-500 text-white rounded shadow p-4 text-center hover:bg-emerald-600 transition"
          >
            <p className="font-semibold text-sm">My Addresses</p>
            <p className="text-xs mt-1">Manage delivery addresses.</p>
          </Link>

          <Link
            to="/customer/cart"
            className="bg-purple-500 text-white rounded shadow p-4 text-center hover:bg-purple-600 transition"
          >
            <p className="font-semibold text-sm">Go to Cart</p>
            <p className="text-xs mt-1">Review items and checkout.</p>
          </Link>
        </div>

        {/* Recent orders */}
        <div className="bg-white rounded shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Recent Orders</h3>

          {recentOrders.length === 0 ? (
            <p className="text-sm text-gray-500">
              No orders yet. Start shopping from the Shop page.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              {recentOrders.map((order) => (
                <div
                  key={order._id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border rounded px-3 py-2"
                >
                  <div>
                    <p className="font-semibold">
                      Order #{order._id.slice(-6)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString()} • ₹
                      {order.totalAmount}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs px-2 py-1 rounded capitalize ${
                        order.status === "delivered"
                          ? "bg-green-100 text-green-700"
                          : order.status === "cancelled"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {order.status}
                    </span>
                    <Link
                      to={`/customer/orders/${order._id}`}
                      className="text-xs text-orange-600 hover:underline"
                    >
                      View details →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {recentOrders.length > 0 && (
            <div className="mt-3 text-right">
              <Link
                to="/customer/orders"
                className="text-xs text-blue-600 hover:underline"
              >
                View all orders
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
