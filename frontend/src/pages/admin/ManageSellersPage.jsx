import { useEffect, useState } from 'react';
import api from '../../utils/api';
import SellerApprovalCard from '../../components/admin/SellerApprovalCard';
import Layout from '../../components/common/Layout';

export default function ManageSellersPage() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/sellers/pending'); // ✅ backend route
      setSellers(res.data.sellers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const handleApprove = async (sellerId) => {
    try {
      await api.patch(`/admin/sellers/${sellerId}/approve`);
      loadPending();
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (sellerId) => {
    try {
      await api.patch(`/admin/sellers/${sellerId}/reject`);
      loadPending();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredSellers = sellers.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.userId?.name?.toLowerCase().includes(q) ||   // backend me name/email userId me hai [file:24]
      s.userId?.email?.toLowerCase().includes(q) ||
      s.businessName?.toLowerCase().includes(q)
    );
  });

  const visibleSellers = filteredSellers.filter((s) => {
    if (statusFilter === 'all') return true;
    // pending list me isApproved false + kycStatus se status dekh sakte ho
    if (statusFilter === 'pending') return s.kycStatus === 'pending';
    if (statusFilter === 'approved') return s.isApproved === true;
    if (statusFilter === 'suspended') return s.status === 'suspended';
    return true;
  });

  return (
    <Layout title="Manage Sellers">
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          className="border px-3 py-2 rounded text-sm flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border px-3 py-2 rounded text-sm w-full md:w-48"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="all">All</option>
        </select>
      </div>

      <h1 className="text-xl font-bold mb-4">Manage Sellers</h1>

      {loading && <p>Loading...</p>}

      {!loading && visibleSellers.length === 0 && (
        <p>No sellers found.</p>
      )}

      {visibleSellers.map((s) => (
        <SellerApprovalCard
          key={s._id}
          seller={s}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      ))}
    </Layout>
  );
}
