// src/pages/admin/ManageSellersPage.jsx
import { useEffect, useState } from 'react';
import api from '../../utils/api';
import SellerApprovalCard from '../../components/admin/SellerApprovalCard';
import Layout from '../../components/common/Layout';

export default function ManageSellersPage() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadPending = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/sellers/pending');
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

  return (
    <Layout title="Manage Sellers">
      <h1 className="text-xl font-bold mb-4">Pending Sellers</h1>
      {loading && <p>Loading...</p>}
      {!loading && sellers.length === 0 && <p>No pending sellers.</p>}
      {sellers.map((s) => (
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
