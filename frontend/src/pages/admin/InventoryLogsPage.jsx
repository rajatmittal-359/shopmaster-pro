import { useEffect, useState } from 'react';
import Layout from '../../components/common/Layout';
import { getInventoryLogs } from '../../services/inventoryService';

export default function InventoryLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    try {
      const res = await getInventoryLogs();
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <Layout title="Inventory Logs">
      <h2 className="text-2xl font-bold mb-4">Inventory Logs</h2>

      {loading && <p>Loading...</p>}

      {!loading && logs.length === 0 && (
        <p className="text-sm text-gray-600">No inventory logs found.</p>
      )}

      {!loading && logs.length > 0 && (
        <div className="space-y-3">
          {logs.map((log) => (
            <div
              key={log._id}
              className="bg-white p-4 rounded shadow border text-sm"
            >
              <div className="flex justify-between mb-2">
                <span className="font-semibold capitalize">
                  {log.type}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>

              <p className="text-gray-700">
                <b>Product:</b> {log.productId?.name}
              </p>

              <p>
                <b>Stock:</b> {log.stockBefore} → {log.stockAfter}
              </p>

              <p>
                <b>Qty Change:</b> {log.quantity}
              </p>

              {log.orderId && (
                <p className="text-xs text-blue-600">
                  Order ID: {log.orderId._id}
                </p>
              )}

              {log.performedBy && (
                <p className="text-xs text-gray-600">
                  By: {log.performedBy.name}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
