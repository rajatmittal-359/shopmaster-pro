import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/common/Layout";
import { getInventoryLogs } from "../../services/inventoryService";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "sale", label: "Sales" },
  { value: "return", label: "Returns" },
  { value: "restock", label: "Restocks" },
  { value: "adjustment", label: "Adjustments" },
];

export default function InventoryLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("7d"); // 7d, 30d, all

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await getInventoryLogs();
      setLogs(res.data.logs || []);
    } catch (error) {
      console.error("Failed to load admin inventory logs", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    let data = [...logs];

    // Date filter
    if (dateFilter !== "all") {
      const now = Date.now();
      const ms =
        dateFilter === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
      data = data.filter(
        (log) => now - new Date(log.createdAt).getTime() <= ms
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      data = data.filter((log) => log.type === typeFilter);
    }

    // Product / seller search
    if (search.trim()) {
      const q = search.toLowerCase();
      data = data.filter((log) => {
        const productName = (log.productId?.name || "").toLowerCase();
        const sellerName =
          (log.productId?.sellerId?.name || "").toLowerCase();
        return productName.includes(q) || sellerName.includes(q);
      });
    }

    return data;
  }, [logs, typeFilter, search, dateFilter]);

  const getTypeBadge = (type) => {
    const base =
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium";
    if (type === "sale") {
      return (
        <span className={`${base} bg-red-50 text-red-700 border border-red-200`}>
          Sale
        </span>
      );
    }
    if (type === "return") {
      return (
        <span
          className={`${base} bg-green-50 text-green-700 border border-green-200`}
        >
          Return
        </span>
      );
    }
    if (type === "restock") {
      return (
        <span
          className={`${base} bg-blue-50 text-blue-700 border border-blue-200`}
        >
          Restock
        </span>
      );
    }
    if (type === "adjustment") {
      return (
        <span
          className={`${base} bg-yellow-50 text-yellow-700 border border-yellow-200`}
        >
          Adjustment
        </span>
      );
    }
    return (
      <span className={`${base} bg-gray-50 text-gray-700 border border-gray-200`}>
        {type}
      </span>
    );
  };

  const getQtyColor = (type) => {
    if (type === "sale") return "text-red-600";
    if (type === "return" || type === "restock") return "text-green-600";
    return "text-gray-800";
  };

  // Net qty summary for current filter window (optional but useful)
  const netQty = useMemo(
    () => filteredLogs.reduce((sum, log) => sum + (log.quantity || 0), 0),
    [filteredLogs]
  );

  return (
    <Layout title="Inventory Logs">
      {/* Header + summary */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Inventory Logs</h2>
        {!loading && logs.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-gray-500">
              Showing {filteredLogs.length} of {logs.length} entries
            </p>
            <p className="text-xs text-gray-600">
              Net qty change in view:{" "}
              <span
                className={
                  netQty > 0
                    ? "text-green-600 font-semibold"
                    : netQty < 0
                    ? "text-red-600 font-semibold"
                    : "font-semibold"
                }
              >
                {netQty > 0 ? `+${netQty}` : netQty}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded shadow mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Search by product or seller..."
            className="border px-3 py-2 rounded text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="border px-3 py-2 rounded text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            className="border px-3 py-2 rounded text-sm"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && logs.length === 0 && (
        <p className="text-sm text-gray-600">No inventory logs found.</p>
      )}

      {!loading && logs.length > 0 && filteredLogs.length === 0 && (
        <p className="text-sm text-gray-600">
          No logs match current filters. Try changing filters.
        </p>
      )}

      {!loading && filteredLogs.length > 0 && (
        <div className="space-y-3">
          {filteredLogs.map((log) => (
            <div
              key={log._id}
              className="bg-white p-4 rounded shadow border text-sm"
            >
              {/* Header: type + order + time */}
              <div className="flex justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getTypeBadge(log.type)}
                  {log.orderId && (
                    <span className="text-[11px] text-blue-600">
                      Order #{log.orderId._id.slice(-6)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>

              {/* Product + seller */}
              <p className="text-gray-800">
                <b>Product:</b> {log.productId?.name || "Unknown"}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Seller: {log.productId?.sellerId?.name || "Unknown seller"}
              </p>

              {/* Stock + qty */}
              <p className="mt-1">
                <b>Stock:</b> {log.stockBefore} → {log.stockAfter}
              </p>

              <p className={`mt-1 ${getQtyColor(log.type)}`}>
                <b>Qty change:</b>{" "}
                {log.quantity > 0 ? `+${log.quantity}` : log.quantity}
              </p>

              {/* Footer: who + reason */}
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-600">
                  {log.performedBy ? (
                    <>
                      By:{" "}
                      <span className="font-medium">
                        {log.performedBy.name}
                      </span>
                    </>
                  ) : (
                    "By: System"
                  )}
                </p>

                {log.reason && (
                  <p className="text-[11px] text-gray-500 italic text-right">
                    Reason: {log.reason}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
