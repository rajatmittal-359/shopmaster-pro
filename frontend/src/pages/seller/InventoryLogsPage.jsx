import { useEffect, useState } from "react";
import Layout from "../../components/common/Layout";
import { getInventoryLogs } from "../../services/inventoryService";

export default function SellerInventoryLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      const res = await getInventoryLogs();
      setLogs(res.data.logs || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <Layout title="Inventory Logs (Seller)">
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-4">Inventory Logs</h2>

        {loading && <p>Loading...</p>}

        {!loading && logs.length === 0 && (
          <p className="text-sm text-gray-600">No logs found.</p>
        )}

        {!loading && logs.length > 0 && (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log._id}
                className="border p-3 rounded text-sm flex justify-between"
              >
                <div>
                  <p><b>Product:</b> {log.productId?.name}</p>
                  <p><b>Type:</b> {log.type}</p>
                  <p><b>Qty:</b> {log.quantity}</p>
                </div>

                <div className="text-right text-xs text-gray-500">
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
