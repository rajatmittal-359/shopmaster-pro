// frontend/src/pages/seller/SellerDashboard.jsx
import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { getSellerProfile, getSellerAnalytics } from "../../services/sellerService";

import { toastError } from '../../utils/toast';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
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
        toastError('Could not load your dashboard');
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
  // Badge owns the colours; this only says which meaning applies.
  const kycTone =
    profile.kycStatus === "verified"
      ? "success"
      : profile.kycStatus === "rejected"
      ? "danger"
      : "warning";

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

        <div className="flex flex-wrap gap-2">
          <Badge tone={kycTone}>KYC: {kycLabel}</Badge>
          <Badge status={profile.status}>
            Account: {profile.status === "active" ? "Active" : "Suspended"}
          </Badge>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Products"
          value={stats.totalProducts}
          hint="Everything in your store that you have not deleted."
        />
        <StatCard
          label="On sale"
          value={stats.activeProducts}
          accent="success"
          hint="Visible to customers right now. The rest are hidden."
        />
        <StatCard
          label="Low stock"
          value={stats.lowStock}
          accent={stats.lowStock > 0 ? 'danger' : 'neutral'}
          hint="On sale and at or below your alert threshold."
        />
        <StatCard
          label="Sales"
          value={`₹${stats.revenue}`}
          accent="brand"
          hint="Item value on paid orders, before platform commission."
        />
      </div>

      {/* Quick actions + info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Quick actions */}
        <Card
          title="Quick actions"
          hint="Your catalogue, orders and stock history."
          className="lg:col-span-2"
        >
          {/*
            These were three colours - orange, blue and near-black - which read
            as three different kinds of thing. They are all just navigation, so
            one leads and the rest follow. They were also plain <a href>, which
            reloads the whole app on every click instead of routing.
          */}
          <div className="flex flex-wrap gap-3">
            <Button as={Link} to="/seller/products" variant="primary">
              Manage products
            </Button>
            <Button as={Link} to="/seller/orders" variant="secondary">
              View orders
            </Button>
            <Button as={Link} to="/seller/inventory-logs" variant="secondary">
              Inventory logs
            </Button>
          </div>
        </Card>

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
