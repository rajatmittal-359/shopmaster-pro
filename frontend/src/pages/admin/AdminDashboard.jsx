import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import api from '../../utils/api';
import { Link } from 'react-router-dom';

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

  const handleApproveSeller = async (sellerId) => {
    try {
      await api.patch(`/admin/sellers/${sellerId}/approve`);
      alert('Seller approved');
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve');
    }
  };

  const handleRejectSeller = async (sellerId) => {
    try {
      await api.patch(`/admin/sellers/${sellerId}/reject`);
      alert('Seller rejected');
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject');
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

      {/* Analytics Cards */}
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

        <div className="bg-white rounded shadow p-4">
          <p className="text-sm text-gray-600">Total Orders</p>
          <p className="text-2xl font-bold text-green-600">
            {analytics?.orders || 0}
          </p>
        </div>
      </div>

      {/* Revenue Card */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded shadow p-6 mb-6">
        <p className="text-sm opacity-90">Platform Revenue</p>
        <p className="text-3xl font-bold">
          ₹{analytics?.revenue?.toLocaleString() || 0}
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link
          to="/admin/manage-sellers"
          className="bg-white rounded shadow p-4 hover:shadow-md transition text-center"
        >
          <p className="text-lg font-semibold text-gray-700">Manage Sellers</p>
          <p className="text-sm text-gray-500">Approve/Reject pending sellers</p>
        </Link>

        <Link
          to="/admin/categories"
          className="bg-white rounded shadow p-4 hover:shadow-md transition text-center"
        >
          <p className="text-lg font-semibold text-gray-700">Manage Categories</p>
          <p className="text-sm text-gray-500">Add/Edit product categories</p>
        </Link>

        <div className="bg-white rounded shadow p-4 text-center opacity-50 cursor-not-allowed">
          <p className="text-lg font-semibold text-gray-700">Reports</p>
          <p className="text-sm text-gray-500">Coming soon</p>
        </div>
      </div>

      {/* Pending Sellers Table */}
      {pendingSellers.length > 0 && (
        <div className="bg-white rounded shadow p-4">
          <h3 className="text-lg font-semibold mb-3">
            Pending Seller Approvals ({pendingSellers.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left px-3 py-2">Business Name</th>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">GST</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-center px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingSellers.map((seller) => (
                  <tr key={seller._id} className="border-t">
                    <td className="px-3 py-2">{seller.businessName}</td>
                    <td className="px-3 py-2">{seller.userId?.email}</td>
                    <td className="px-3 py-2 text-xs">{seller.gstNumber || 'N/A'}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-700">
                        {seller.kycStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleApproveSeller(seller._id)}
                        className="text-xs px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 mr-2"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRejectSeller(seller._id)}
                        className="text-xs px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingSellers.length === 0 && (
        <div className="bg-white rounded shadow p-6 text-center text-gray-500">
          <p>No pending seller approvals</p>
        </div>
      )}
    </Layout>
  );
}
