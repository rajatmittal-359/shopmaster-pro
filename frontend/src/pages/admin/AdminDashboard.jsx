import { useEffect, useState, useMemo } from "react";
import Layout from "../../components/common/Layout";
import { getAdminAnalytics } from "../../services/adminService";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

import { toastError } from '../../utils/toast';
import Button from '../../components/ui/Button';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
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
      toastError('Could not load the dashboard');
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
          <div className="h-8 bg-gray-200 rounded-lg w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg" />
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
        <Button variant="secondary" onClick={loadAnalytics}>
          Refresh
        </Button>
      </div>

      {/* Stats Cards - Top 4 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Sellers"
          value={analytics.sellers?.total ?? 0}
          accent="info"
          hint={`${analytics.sellers?.approved ?? 0} approved, ${
            analytics.sellers?.pending ?? 0
          } awaiting approval`}
        />
        <StatCard
          label="Awaiting approval"
          value={analytics.sellers?.pending ?? 0}
          accent={analytics.sellers?.pending > 0 ? 'warning' : 'neutral'}
          hint="Sellers who cannot list anything until you review them."
        />
        <StatCard
          label="Products"
          value={analytics.products ?? 0}
          accent="success"
          hint="Live across all sellers."
        />
        <StatCard
          label="Orders today"
          value={analytics.ordersToday ?? 0}
          hint={`Last 24 hours. ${analytics.orders ?? 0} since the shop opened.`}
        />
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <StatCard
          label="Platform revenue"
          value={`₹${analytics.revenue ?? 0}`}
          accent="brand"
          secondary={`of ₹${analytics.grossSales ?? 0} gross sales`}
          hint="Commission on paid orders. Your own shop is on 0%, so its sales earn nothing here."
        />
        <StatCard
          label="Gross sales"
          value={`₹${analytics.grossSales ?? 0}`}
          secondary="Mostly the sellers' money"
          hint="Everything customers paid on orders that went through."
        />
      </div>

      {/* Last 7 Days Revenue Chart */}
      <div className="bg-white rounded-xl shadow p-5 mb-6">
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
                ? "text-positive"
                : netQtyChange < 0
                ? "text-red-600"
                : "text-gray-600"
            }`}
          >
            {netQtyChange > 0 ? `+₹${netQtyChange}` : `₹${netQtyChange}`}
          </span>
        </div>

        {analytics.revenueByDay && analytics.revenueByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={analytics.revenueByDay}>
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
          <EmptyState
            title="No sales in the last 7 days"
            hint="The chart fills in as orders are paid for."
          />
        )}
      </div>

      {/* Low Stock Alert + Top Sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/*
          Low Stock (Global)

          A flex column, and the list below flexes to fill it. The list had a
          fixed max-h-64 while Top Sellers beside it grew to fit its four rows -
          so the grid stretched this card to match and left dead white space
          under a list that was still scrolling. Filling the height removes the
          gap AND shows more of the thing the card is for.
        */}
        <div className="bg-white rounded-xl shadow p-5 flex flex-col">
          <h3 className="text-lg font-semibold mb-3">Low Stock (Global)</h3>
          <p className="text-xs text-gray-500 mb-3">
            Products below alert threshold across all sellers and categories
          </p>

          {analytics.lowStockGlobal && analytics.lowStockGlobal.length > 0 ? (
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0 max-h-96">
              {analytics.lowStockGlobal.map((prod) => (
                <div
                  key={prod._id}
                  className="flex justify-between items-center p-2 border rounded-lg bg-brand-50"
                >
                  <div>
                    <p className="text-sm font-medium">{prod.name}</p>
                    <p className="text-xs text-gray-600">
                      Seller: {prod.sellerName || "Unknown"} | {prod.category || "N/A"}
                    </p>
                  </div>
                  <span className="text-xs text-red-600 font-semibold">
                    {prod.stock} left
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                title="Nothing is running low"
                hint="Products appear here once they reach their alert threshold."
              />
            </div>
          )}
        </div>

        {/* Top Sellers. Same flex column, so whichever card is shorter fills
            the row rather than leaving a gap under it. */}
        <div className="bg-white rounded-xl shadow p-5 flex flex-col">
          <h3 className="text-lg font-semibold mb-3">Top Sellers</h3>
          <p className="text-xs text-gray-500 mb-3">
            Based on revenue from completed orders (all time)
          </p>

          {analytics.topSellers && analytics.topSellers.length > 0 ? (
            <div className="space-y-2 overflow-y-auto flex-1 min-h-0 max-h-96">
              {analytics.topSellers.map((seller, idx) => (
                <div key={seller._id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium">
                        #{idx + 1} {seller.sellerName}
                      </p>
                      <p className="text-xs text-gray-600">
                        {seller.sellerEmail}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <span className="text-gray-600">
                      Items Sold: <span className="font-semibold">{seller.itemsSold}</span>
                    </span>
                    <span className="text-positive font-semibold">
                      ₹{seller.revenue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="flex-1 flex items-center justify-center text-sm text-gray-600">
              No seller data yet
            </p>
          )}
        </div>
      </div>

      {/* Footer note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-blue-800">
          <strong>Dashboard Notes:</strong> Stats reflect real-time data. Revenue calculations include completed orders only. Low stock alerts are based on product thresholds. Stripe/payment settlement will be calculated separately.
        </p>
      </div>
    </Layout>
  );
}
