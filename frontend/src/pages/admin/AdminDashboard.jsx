import { useEffect, useState, useMemo } from "react";
import Layout from "../../components/common/Layout";
import { getAdminAnalytics } from "../../services/adminService";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const res = await getAdminAnalytics();
      setAnalytics(res.data);
    } catch (error) {
      console.error("Failed to load admin analytics", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate net qty change for filtered revenue data
  const netQtyChange = useMemo(() => {
    if (!analytics?.last7DaysRevenue) return 0;
    return analytics.last7DaysRevenue.reduce((sum, d) => sum + (d.total || 0), 0);
  }, [analytics]);

  if (loading) {
    return (
      <Layout title="Admin Dashboard">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (!analytics) {
    return (
      <Layout title="Admin Dashboard">
        <p className="text-sm text-gray-600">Failed to load analytics.</p>
      </Layout>
    );
  }

  return (
    <Layout title="Admin Dashboard">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold">Admin Dashboard</h2>
        <button
          onClick={loadAnalytics}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Stats Cards - Top 4 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total Sellers */}
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-500">
          <p className="text-sm text-gray-600 font-medium">Total Sellers</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">
            {analytics.totalSellers}
          </p>
          <p className="text-xs text-gray-500 mt-1">Active on platform</p>
        </div>

        {/* Pending Sellers */}
        <div className="bg-white rounded shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-600 font-medium">Pending Sellers</p>
          <p className="text-3xl font-bold text-yellow-600 mt-2">
            {analytics.pendingSellers}
          </p>
          <p className="text-xs text-gray-500 mt-1">Awaiting KYC approval</p>
        </div>

        {/* Total Products */}
        <div className="bg-white rounded shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-600 font-medium">Total Products</p>
          <p className="text-3xl font-bold text-green-600 mt-2">
            {analytics.totalProducts}
          </p>
          <p className="text-xs text-gray-500 mt-1">Across all sellers</p>
        </div>

        {/* Orders Today */}
        <div className="bg-white rounded shadow p-4 border-l-4 border-purple-500">
          <p className="text-sm text-gray-600 font-medium">Orders Today</p>
          <p className="text-3xl font-bold text-purple-600 mt-2">
            {analytics.ordersToday || 0}
          </p>
          <p className="text-xs text-gray-500 mt-1">Last 24 hours</p>
        </div>
      </div>

      {/* Revenue Card */}
      <div className="bg-white rounded shadow p-5 mb-6 border-t-4 border-orange-500">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="text-lg font-semibold">Platform Revenue</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              From completed orders (all time)
            </p>
          </div>
          <span className="text-2xl font-bold text-orange-600">
            ₹{analytics.totalRevenue || 0}
          </span>
        </div>
      </div>

      {/* Last 7 Days Revenue Chart */}
      <div className="bg-white rounded shadow p-5 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">Last 7 Days Revenue</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Daily order revenue trend
            </p>
          </div>
          <span
            className={`text-sm font-semibold ${
              netQtyChange > 0
                ? "text-green-600"
                : netQtyChange < 0
                ? "text-red-600"
                : "text-gray-600"
            }`}
          >
            {netQtyChange > 0 ? `+₹${netQtyChange}` : `₹${netQtyChange}`}
          </span>
        </div>

        {analytics.last7DaysRevenue && analytics.last7DaysRevenue.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={analytics.last7DaysRevenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                }}
                formatter={(value) => [`₹${value}`, "Revenue"]}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#f97316"
                fill="#fed7aa"
                isAnimationActive={true}
                dot={{ fill: "#f97316", r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
            No revenue data for last 7 days
          </div>
        )}
      </div>

      {/* Low Stock Alert + Top Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Low Stock (Global) */}
        <div className="bg-white rounded shadow p-5">
          <h3 className="text-lg font-semibold mb-3">Low Stock (Global)</h3>
          <p className="text-xs text-gray-500 mb-3">
            Products below alert threshold across all sellers and categories
          </p>

          {analytics.lowStockProducts && analytics.lowStockProducts.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {analytics.lowStockProducts.map((prod) => (
                <div
                  key={prod._id}
                  className="flex justify-between items-center p-2 border rounded bg-orange-50"
                >
                  <div>
                    <p className="text-sm font-medium">{prod.name}</p>
                    <p className="text-xs text-gray-600">
                      Seller: {prod.sellerId?.name || "Unknown"}
                    </p>
                  </div>
                  <span className="text-xs text-red-600 font-semibold">
                    {prod.stock} left
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-8 text-center">
              No low stock products 🎉
            </p>
          )}
        </div>

        {/* Top Sellers */}
        <div className="bg-white rounded shadow p-5">
          <h3 className="text-lg font-semibold mb-3">Top Sellers</h3>
          <p className="text-xs text-gray-500 mb-3">
            Based on revenue from completed orders (all time)
          </p>

          {analytics.topSellers && analytics.topSellers.length > 0 ? (
            <div className="space-y-2">
              {analytics.topSellers.map((seller, idx) => (
                <div key={seller._id} className="border rounded p-3 bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">
                        #{idx + 1} {seller.name}
                      </p>
                      <p className="text-xs text-gray-600">
                        {seller.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-gray-600">
                      Items Sold: <span className="font-semibold">{seller.totalItemsSold}</span>
                    </span>
                    <span className="text-green-600 font-semibold">
                      ₹{seller.totalRevenue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-8 text-center">
              No seller data yet
            </p>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div className="bg-blue-50 border border-blue-200 rounded p-4">
        <p className="text-xs text-blue-800">
          <strong>Dashboard Notes:</strong> Stats reflect real-time data. Revenue calculations include completed orders only. Low stock alerts are based on product thresholds. Stripe/payment settlement will be calculated separately.
        </p>
      </div>
    </Layout>
  );
}
