// frontend/src/pages/seller/SellerDashboard.jsx
import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { getSellerProfile, getSellerAnalytics } from "../../services/sellerService";

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
        console.error("Failed to load seller dashboard", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <Layout title="Seller Dashboard">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded" />
            ))}
          </div>
          <div className="h-40 bg-gray-200 rounded" />
        </div>
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

  const kycLabel = profile.kycStatus === "verified" ? "Verified" : profile.kycStatus || "Pending";
  const kycColor =
    profile.kycStatus === "verified"
      ? "bg-green-100 text-green-700"
      : profile.kycStatus === "rejected"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";

  const stats = {
    totalProducts: analytics?.products?.total || 0,
    activeProducts: analytics?.products?.active || 0,
    lowStock: analytics?.products?.lowStock || 0,
    revenue: analytics?.revenue || 0,
  };

  return (
    <Layout title="Seller Dashboard">
      {/* Header + business info */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
        <div>
          <h2 className="text-3xl font-bold mb-1">Seller Dashboard</h2>
          <p className="text-sm text-gray-600">
            Welcome back, <span className="font-semibold">{profile.businessName}</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`px-3 py-1 rounded-full font-medium ${kycColor}`}>
            KYC: {kycLabel}
          </span>
          <span
            className={`px-3 py-1 rounded-full font-medium ${
              profile.status === "active"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            Account: {profile.status === "active" ? "Active" : "Suspended"}
          </span>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Total products */}
        <div className="bg-white rounded shadow p-4 border-l-4 border-blue-500 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Total Products
            </p>
            <p className="text-3xl font-bold text-blue-600 mt-1">
              {stats.totalProducts}
            </p>
          </div>
          <p className="text-11px text-gray-500 mt-1">
            All products created under your store.
          </p>
        </div>

        {/* Active products */}
        <div className="bg-white rounded shadow p-4 border-l-4 border-emerald-500 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Active Products
            </p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">
              {stats.activeProducts}
            </p>
          </div>
          <p className="text-11px text-gray-500 mt-1">
            Currently visible to customers in the shop.
          </p>
        </div>

        {/* Low stock */}
        <div className="bg-white rounded shadow p-4 border-l-4 border-red-500 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Low Stock
            </p>
            <p className="text-3xl font-bold text-red-600 mt-1">
              {stats.lowStock}
            </p>
          </div>
          <p className="text-11px text-gray-500 mt-1">
            Products at or below your alert threshold.
          </p>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded shadow p-4 border-l-4 border-orange-500 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Revenue
            </p>
            <p className="text-3xl font-bold text-orange-600 mt-1">
              ₹{stats.revenue}
            </p>
          </div>
          <p className="text-11px text-gray-500 mt-1">
            From completed orders across all time.
          </p>
        </div>
      </div>

      {/* Quick actions + info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quick actions */}
        <div className="bg-white rounded shadow p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
          <p className="text-xs text-gray-600 mb-3">
            Manage your catalog, orders, and inventory from these shortcuts.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="/seller/products"
              className="px-4 py-2 rounded text-xs font-semibold bg-orange-500 text-white hover:bg-orange-600"
            >
              Manage Products
            </a>
            <a
              href="/seller/orders"
              className="px-4 py-2 rounded text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600"
            >
              View Orders
            </a>
            <a
              href="/seller/inventory-logs"
              className="px-4 py-2 rounded text-xs font-semibold bg-gray-800 text-white hover:bg-gray-900"
            >
              Inventory Logs
            </a>
          </div>
        </div>

        {/* Info / notes */}
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-xs text-blue-900">
          <h3 className="text-sm font-semibold mb-2">Dashboard Notes</h3>
          <ul className="list-disc pl-4 space-y-1">
            <li>Revenue counts only completed orders linked to your products.</li>
            <li>Low stock is based on per-product alert thresholds.</li>
            <li>
              Use Inventory Logs to audit stock changes from sales, returns, and manual
              adjustments.
            </li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
