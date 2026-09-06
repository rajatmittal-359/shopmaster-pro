import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { 
  getPendingSellers, 
  approveSeller, 
  rejectSeller,
  suspendSeller,
  activateSeller,
  setSellerCommission
} from "../../services/adminService";
import { toastSuccess, toastError } from "../../utils/toast";
import Loader from "../../components/common/Loader";

import { useConfirm } from '../../context/confirmContext';
export default function ManageSellersPage() {
  const confirm = useConfirm();
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, pending, active, suspended
  // Rate boxes being typed in, keyed by seller id. Held apart from `sellers`
  // so a half-typed number never reads as the saved rate.
  const [rates, setRates] = useState({});
  const [savingRate, setSavingRate] = useState(null);

  useEffect(() => {
    loadSellers();
  }, []);

  const loadSellers = async () => {
  try {
    setLoading(true);
    const res = await getPendingSellers();  // ✅ Ye function SAME rahega!
    setSellers(res.data.sellers || []);
  } catch (err) {
    toastError(err?.response?.data?.message || "Failed to load sellers");
  } finally {
    setLoading(false);
  }
};

  const handleApprove = async (id) => {
    try {
      await approveSeller(id);
      toastSuccess("Seller approved successfully");
      loadSellers();
    } catch (err) {
      toastError(err?.response?.data?.message || "Failed to approve seller");
    }
  };

  /**
   * Change what the platform charges this seller.
   *
   * Orders already placed keep the rate they were sold under - it is copied
   * onto each line when the order is made - so this only ever changes what
   * happens from here on.
   */
  const saveRate = async (seller, value) => {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toastError("The commission rate has to be between 0 and 100");
      return;
    }

    setSavingRate(seller._id);
    try {
      const { data } = await setSellerCommission(seller._id, rate);
      toastSuccess(data.message || "Commission updated");
      setRates((r) => ({ ...r, [seller._id]: undefined }));
      await loadSellers();
    } catch (err) {
      toastError(err?.response?.data?.message || "Could not change that rate");
    } finally {
      setSavingRate(null);
    }
  };

  const handleReject = async (id) => {
    try {
      await rejectSeller(id);
      toastSuccess("Seller rejected");
      loadSellers();
    } catch (err) {
      toastError(err?.response?.data?.message || "Failed to reject seller");
    }
  };

  const handleSuspend = async (id) => {
    const reason = prompt("Enter suspension reason:");
    if (!reason) return;
    
    try {
      await suspendSeller(id, reason);
      toastSuccess("Seller suspended successfully");
      loadSellers();
    } catch (err) {
      toastError(err?.response?.data?.message || "Failed to suspend seller");
    }
  };

  const handleActivate = async (id) => {
    const sure = await confirm({
      title: 'Activate this seller?',
      message: 'They will be able to list products and receive orders again.',
      confirmLabel: 'Activate',
      danger: false,
    });
    if (!sure) return;
    
    try {
      await activateSeller(id);
      toastSuccess("Seller activated successfully");
      loadSellers();
    } catch (err) {
      toastError(err?.response?.data?.message || "Failed to activate seller");
    }
  };

  // Filter sellers based on selected tab
  const filteredSellers = sellers.filter((s) => {
    if (filter === "pending") return !s.isApproved;
    if (filter === "active") return s.isApproved && s.status === "active";
    if (filter === "suspended") return s.status === "suspended";
    return true; // "all"
  });

  if (loading) return <Layout title="Manage Sellers"><Loader /></Layout>;

  return (
    <Layout title="Manage Sellers">
      <h2 className="text-2xl font-bold mb-4">Manage Sellers</h2>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 text-sm font-medium ${
            filter === "all"
              ? "border-b-2 border-brand-600 text-brand-ink"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          All ({sellers.length})
        </button>
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 text-sm font-medium ${
            filter === "pending"
              ? "border-b-2 border-brand-600 text-brand-ink"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Pending ({sellers.filter((s) => !s.isApproved).length})
        </button>
        <button
          onClick={() => setFilter("active")}
          className={`px-4 py-2 text-sm font-medium ${
            filter === "active"
              ? "border-b-2 border-brand-600 text-brand-ink"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Active ({sellers.filter((s) => s.isApproved && s.status === "active").length})
        </button>
        <button
          onClick={() => setFilter("suspended")}
          className={`px-4 py-2 text-sm font-medium ${
            filter === "suspended"
              ? "border-b-2 border-brand-600 text-brand-ink"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Suspended ({sellers.filter((s) => s.status === "suspended").length})
        </button>
      </div>

      {/* Sellers List */}
      {filteredSellers.length === 0 ? (
        <p className="text-gray-500 text-sm">No sellers found.</p>
      ) : (
        <div className="space-y-3">
          {filteredSellers.map((seller) => (
            <div
              key={seller._id}
              className="bg-white border rounded-lg p-4 flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">{seller.businessName}</p>
                <p className="text-sm text-gray-600">
                  {seller.userId?.name} • {seller.userId?.email}
                </p>
                <div className="flex gap-2 mt-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-lg ${
                      seller.isApproved
                        ? "bg-positive-tint text-positive"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {seller.isApproved ? "Approved" : "Pending"}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-lg ${
                      seller.status === "active"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {seller.status === "active" ? "Active" : "Suspended"}
                  </span>
                </div>
                {seller.status === "suspended" && seller.suspensionReason && (
                  <p className="text-xs text-red-600 mt-1">
                    Reason: {seller.suspensionReason}
                  </p>
                )}

                {/*
                  What the platform charges this seller.

                  A negotiated rate was always possible in the data - it just
                  had no screen, so "let my friend sell commission-free" was a
                  developer task and every agreed rate lived in somebody's
                  memory. Changing it never touches an order already placed:
                  the rate is copied onto each line when the order is made.
                */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-600">Commission</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    aria-label={`Commission rate for ${seller.businessName}`}
                    value={
                      rates[seller._id] ?? String(seller.commissionRate ?? 8)
                    }
                    onChange={(e) =>
                      setRates((r) => ({ ...r, [seller._id]: e.target.value }))
                    }
                    className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm
                               focus:outline-none focus:ring-2 focus:ring-brand-fill"
                  />
                  <span className="text-xs text-gray-600">%</span>

                  <button
                    type="button"
                    disabled={savingRate === seller._id}
                    onClick={() => saveRate(seller, rates[seller._id])}
                    className="text-xs text-brand-ink hover:underline disabled:opacity-50"
                  >
                    Save
                  </button>

                  {/* The whole point of the ask: one press, not a form. */}
                  {Number(seller.commissionRate) !== 0 && (
                    <button
                      type="button"
                      disabled={savingRate === seller._id}
                      onClick={() => saveRate(seller, 0)}
                      className="text-xs text-gray-600 hover:underline disabled:opacity-50"
                    >
                      Make commission-free
                    </button>
                  )}
                  {Number(seller.commissionRate) === 0 && (
                    <span className="text-xs text-positive font-medium">
                      Commission-free
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {/* Pending Sellers: Approve/Reject */}
                {!seller.isApproved && (
                  <>
                    <button
                      onClick={() => handleApprove(seller._id)}
                      className="px-3 py-1 text-sm bg-positive text-white rounded-lg hover:bg-positive-strong"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(seller._id)}
                      className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      Reject
                    </button>
                  </>
                )}

                {/* Active Sellers: Suspend */}
                {seller.isApproved && seller.status === "active" && (
                  <button
                    onClick={() => handleSuspend(seller._id)}
                    className="px-3 py-1 text-sm bg-brand-fill text-on-brand rounded-lg hover:bg-brand-fill-hover"
                  >
                    Suspend
                  </button>
                )}

                {/* Suspended Sellers: Activate */}
                {seller.status === "suspended" && (
                  <button
                    onClick={() => handleActivate(seller._id)}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    Activate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
