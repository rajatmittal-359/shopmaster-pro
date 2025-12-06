import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import {
  getSellerProfile,
  getSellerAnalytics,
} from '../../services/sellerService';

export default function SellerDashboard() {
  const [profile, setProfile] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [profRes, analyticsRes] = await Promise.all([
          getSellerProfile(),
          getSellerAnalytics(),
        ]);
        setProfile(profRes.data);
        setAnalytics(analyticsRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <Layout title="Seller Dashboard">
        <p>Loading...</p>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout title="Seller Dashboard">
        <p className="text-sm text-red-600">
          Seller profile not found. Please contact support.
        </p>
      </Layout>
    );
  }

  if (!profile.isApproved) {
    return (
      <Layout title="Seller Dashboard">
        <div className="mt-4 p-4 border border-yellow-300 bg-yellow-50 rounded">
          <h2 className="font-semibold mb-1">Account under review</h2>
          <p className="text-sm text-gray-700">
            Your seller application is pending admin approval. You will be able
            to add products and manage orders once your account is approved.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Seller Dashboard">
      <h2 className="text-2xl font-bold mb-4">Seller Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-white shadow rounded">
          <p className="text-sm text-gray-500">Business Name</p>
          <p className="text-lg font-semibold">{profile.businessName}</p>
        </div>
        <div className="p-4 bg-white shadow rounded">
          <p className="text-sm text-gray-500">KYC Status</p>
          <p className="text-lg font-semibold capitalize">
            {profile.kycStatus}
          </p>
        </div>
        <div className="p-4 bg-white shadow rounded">
          <p className="text-sm text-gray-500">Total Products</p>
          <p className="text-lg font-semibold">
            {analytics?.products?.total || 0}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white shadow rounded">
          <p className="text-sm text-gray-500">Active Products</p>
          <p className="text-lg font-semibold">
            {analytics?.products?.active || 0}
          </p>
        </div>
        <div className="p-4 bg-white shadow rounded">
          <p className="text-sm text-gray-500">Low Stock</p>
          <p className="text-lg font-semibold text-red-600">
            {analytics?.products?.lowStock || 0}
          </p>
        </div>
        <div className="p-4 bg-white shadow rounded">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-lg font-semibold">
            ₹{analytics?.revenue || 0}
          </p>
        </div>
      </div>
    </Layout>
  );
}
