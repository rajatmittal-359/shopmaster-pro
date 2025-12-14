import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { 
  getPendingSellers, 
  approveSeller, 
  rejectSeller,
  suspendSeller,
  activateSeller 
} from "../../services/adminService";
import { toastSuccess, toastError } from "../../utils/toast";
import Loader from "../../components/common/Loader";

export default function ManageSellersPage() {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all, pending, active, suspended

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
    if (!window.confirm("Activate this seller?")) return;
    
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
              ? "border-b-2 border-orange-500 text-orange-600"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          All ({sellers.length})
        </button>
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 text-sm font-medium ${
            filter === "pending"
              ? "border-b-2 border-orange-500 text-orange-600"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Pending ({sellers.filter((s) => !s.isApproved).length})
        </button>
        <button
          onClick={() => setFilter("active")}
          className={`px-4 py-2 text-sm font-medium ${
            filter === "active"
              ? "border-b-2 border-orange-500 text-orange-600"
              : "text-gray-600 hover:text-gray-800"
          }`}
        >
          Active ({sellers.filter((s) => s.isApproved && s.status === "active").length})
        </button>
        <button
          onClick={() => setFilter("suspended")}
          className={`px-4 py-2 text-sm font-medium ${
            filter === "suspended"
              ? "border-b-2 border-orange-500 text-orange-600"
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
              className="bg-white border rounded p-4 flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">{seller.businessName}</p>
                <p className="text-sm text-gray-600">
                  {seller.userId?.name} • {seller.userId?.email}
                </p>
                <div className="flex gap-2 mt-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      seller.isApproved
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {seller.isApproved ? "Approved" : "Pending"}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
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
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                {/* Pending Sellers: Approve/Reject */}
                {!seller.isApproved && (
                  <>
                    <button
                      onClick={() => handleApprove(seller._id)}
                      className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(seller._id)}
                      className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Reject
                    </button>
                  </>
                )}

                {/* Active Sellers: Suspend */}
                {seller.isApproved && seller.status === "active" && (
                  <button
                    onClick={() => handleSuspend(seller._id)}
                    className="px-3 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
                  >
                    Suspend
                  </button>
                )}

                {/* Suspended Sellers: Activate */}
                {seller.status === "suspended" && (
                  <button
                    onClick={() => handleActivate(seller._id)}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
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
