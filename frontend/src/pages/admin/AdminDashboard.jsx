import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import api from '../../utils/api';

export default function AdminDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [pendingSellers, setPendingSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [analyticsRes, sellersRes] = await Promise.all([
        api.get('/admin/analytics'),
        api.get('/admin/sellers/pending'),
      ]);

      setAnalytics(analyticsRes.data);
      setPendingSellers(sellersRes.data.sellers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Admin Dashboard">
        <p>Loading...</p>
      </Layout>
    );
  }

  return (
    <Layout title="Admin Dashboard">
      <h2 className="text-2xl font-bold mb-4">Admin Dashboard</h2>

      {/* ✅ TOP METRIC CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded shadow p-4">
          <p className="text-sm text-gray-600">Total Sellers</p>
          <p className="text-2xl font-bold text-orange-600">
            {analytics?.sellers?.total || 0}
          </p>
        </div>

        <div className="bg-white rounded shadow p-4">
          <p className="text-sm text-gray-600">Pending Sellers</p>
          <p className="text-2xl font-bold text-yellow-600">
            {analytics?.sellers?.pending || 0}
          </p>
        </div>

        <div className="bg-white rounded shadow p-4">
          <p className="text-sm text-gray-600">Total Products</p>
          <p className="text-2xl font-bold text-blue-600">
            {analytics?.products || 0}
          </p>
        </div>

        <div className={`bg-white rounded shadow p-4 ${analytics?.orders > 0 ? 'block' : 'hidden'}`}>
          <p className="text-sm text-gray-600">Total Orders</p>
          <p className="text-2xl font-bold text-green-600">
            {analytics?.orders || 0}
          </p>
        </div>
      </div>

      {/* ✅ REVENUE MAIN CARD */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded shadow p-6 mb-8">
        <p className="text-sm opacity-90">Platform Revenue</p>
        <p className="text-3xl font-bold">
          ₹{analytics?.revenue?.toLocaleString() || 0}
        </p>
      </div>

      {/* ✅ SIMPLE REVENUE GRAPH (LAST 7 DAYS) */}
      <div className="bg-white rounded shadow p-4 mb-8">
        <h3 className="text-lg font-semibold mb-3">Last 7 Days Revenue</h3>
        <div className="flex items-end gap-3 h-40">
          {analytics?.revenueByDay?.map((d) => (
            <div key={d.date} className="flex flex-col items-center flex-1">
              <div
                className="w-6 bg-orange-500 rounded"
                style={{ height: `${Math.max(d.total / 50, 10)}%` }}
                title={`₹${d.total}`}
              />
              <span className="text-[10px] mt-1 text-gray-600">
                {d.date.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ✅ LOW STOCK GLOBAL LIST */}
      <div className="bg-white rounded shadow p-4 mb-8">
        <h3 className="text-lg font-semibold mb-3">Low Stock (Global)</h3>

        {analytics?.lowStockGlobal?.length === 0 && (
          <p className="text-sm text-gray-600">No low stock products 🎉</p>
        )}

        {analytics?.lowStockGlobal?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Product</th>
                  <th className="text-left px-3 py-2">Seller</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-center px-3 py-2">Stock</th>
                  <th className="text-center px-3 py-2">Alert</th>
                </tr>
              </thead>
              <tbody>
                {analytics.lowStockGlobal.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2">
                      {item.sellerName}
                      <p className="text-[10px] text-gray-500">{item.sellerEmail}</p>
                    </td>
                    <td className="px-3 py-2">{item.category}</td>
                    <td className="px-3 py-2 text-center font-semibold text-red-600">
                      {item.stock}
                    </td>
                    <td className="px-3 py-2 text-center">
                      ≤ {item.lowStockThreshold}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ✅ TOP SELLERS BY REVENUE */}
      <div className="bg-white rounded shadow p-4 mb-8">
        <h3 className="text-lg font-semibold mb-3">Top Sellers</h3>

        {analytics?.topSellers?.length === 0 && (
          <p className="text-sm text-gray-600">No sales yet</p>
        )}

        {analytics?.topSellers?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Seller</th>
                  <th className="text-center px-3 py-2">Items Sold</th>
                  <th className="text-center px-3 py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topSellers.map((s) => (
                  <tr key={s._id} className="border-t">
                    <td className="px-3 py-2">
                      {s.sellerName}
                      <p className="text-[10px] text-gray-500">
                        {s.sellerEmail}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {s.itemsSold}
                    </td>
                    <td className="px-3 py-2 text-center font-semibold text-green-600">
                      ₹{s.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ✅ PENDING SELLERS QUICK VIEW */}
      {pendingSellers.length > 0 && (
        <div className="bg-white rounded shadow p-4">
          <h3 className="text-lg font-semibold mb-3">
            Pending Seller Approvals ({pendingSellers.length})
          </h3>
          <div className="space-y-2">
            {pendingSellers.map((seller) => (
              <div
                key={seller._id}
                className="flex justify-between items-center border rounded px-3 py-2"
              >
                <div>
                  <p className="font-semibold">{seller.businessName}</p>
                  <p className="text-xs text-gray-600">
                    {seller.userId?.email}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                  {seller.kycStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
