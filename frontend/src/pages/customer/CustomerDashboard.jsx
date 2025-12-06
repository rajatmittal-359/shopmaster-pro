import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import api from '../../utils/api';
import { Link } from 'react-router-dom';

export default function CustomerDashboard() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    cartItems: 0,
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [ordersRes, cartRes] = await Promise.all([
        api.get('/customer/orders'),
        api.get('/customer/cart'),
      ]);

      const orders = ordersRes.data.orders || [];
      const cart = cartRes.data.cart || { items: [] };

      setStats({
        totalOrders: orders.length,
        pendingOrders: orders.filter((o) => o.status === 'pending').length,
        cartItems: cart.items.length,
      });

      setRecentOrders(orders.slice(0, 5)); // Latest 5 orders
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Customer Dashboard">
        <p>Loading...</p>
      </Layout>
    );
  }

  return (
    <Layout title="Customer Dashboard">
      <h2 className="text-2xl font-bold mb-4">Welcome to Your Dashboard</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded shadow p-4">
          <p className="text-sm text-gray-600">Total Orders</p>
          <p className="text-2xl font-bold text-blue-600">{stats.totalOrders}</p>
        </div>

        <div className="bg-white rounded shadow p-4">
          <p className="text-sm text-gray-600">Pending Orders</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pendingOrders}</p>
        </div>

        <div className="bg-white rounded shadow p-4">
          <p className="text-sm text-gray-600">Cart Items</p>
          <p className="text-2xl font-bold text-green-600">{stats.cartItems}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Link
          to="/customer/shop"
          className="bg-orange-500 text-white rounded shadow p-4 text-center hover:bg-orange-600 transition"
        >
          <p className="font-semibold">Browse Products</p>
          <p className="text-xs mt-1">Explore our shop</p>
        </Link>

        <Link
          to="/customer/orders"
          className="bg-blue-500 text-white rounded shadow p-4 text-center hover:bg-blue-600 transition"
        >
          <p className="font-semibold">My Orders</p>
          <p className="text-xs mt-1">Track your orders</p>
        </Link>

        <Link
          to="/customer/addresses"
          className="bg-green-500 text-white rounded shadow p-4 text-center hover:bg-green-600 transition"
        >
          <p className="font-semibold">Addresses</p>
          <p className="text-xs mt-1">Manage delivery addresses</p>
        </Link>

        <Link
          to="/customer/checkout"
          className="bg-purple-500 text-white rounded shadow p-4 text-center hover:bg-purple-600 transition"
        >
          <p className="font-semibold">Checkout</p>
          <p className="text-xs mt-1">Complete your purchase</p>
        </Link>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded shadow p-4">
        <h3 className="text-lg font-semibold mb-3">Recent Orders</h3>
        {recentOrders.length === 0 && (
          <p className="text-sm text-gray-500">No orders yet. Start shopping!</p>
        )}
        {recentOrders.length > 0 && (
          <div className="space-y-2">
            {recentOrders.map((order) => (
              <div
                key={order._id}
                className="flex justify-between items-center border rounded px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-semibold">Order #{order._id.slice(-6)}</p>
                  <p className="text-xs text-gray-600">
                    {order.items.length} items • ₹{order.totalAmount}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      order.status === 'delivered'
                        ? 'bg-green-100 text-green-700'
                        : order.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {order.status}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        {recentOrders.length > 0 && (
          <Link
            to="/customer/orders"
            className="block mt-3 text-sm text-blue-600 hover:underline text-center"
          >
            View All Orders →
          </Link>
        )}
      </div>
    </Layout>
  );
}
