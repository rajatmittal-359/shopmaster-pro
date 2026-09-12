'use client';

import { useEffect, useState } from 'react';
import { authedFetch } from '@/lib/client';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Why the stock number changed.
 *
 * WHY IT IS WORTH A SCREEN
 *   Stock is the number that quietly loses money in both directions: too low
 *   and the shop refuses orders it could have taken, too high and it sells what
 *   is not on the shelf and then cancels on the customer. Six months later,
 *   "why does this say 4 when I counted 2" is unanswerable without this.
 *
 * ONE COMPONENT, TWO AUDIENCES
 *   The endpoint scopes itself: a seller sees only their own products, an admin
 *   sees everything. Writing it twice would mean two chances to get the scoping
 *   wrong - and the wrong one leaks another seller's stock movements.
 */
const WORDS = {
  sale: 'Sold',
  return: 'Came back',
  restock: 'Restocked',
  adjustment: 'Counted by hand',
};

const when = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

export default function LogTable() {
  const [logs, setLogs] = useState([]);
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authedFetch('/inventory');
        if (cancelled) return;
        setLogs(data.logs || []);
        setState({ status: 'idle' });
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="skeleton-in space-y-4" aria-busy="true" aria-label="Loading stock history">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (state.status === 'error') return <p className="text-destructive">{state.message}</p>;

  if (logs.length === 0) {
    return <p className="text-muted-foreground">Nothing has moved yet.</p>;
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {logs.map((log) => {
        const up = log.quantity > 0;

        return (
          <li key={log._id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1">
              <strong>{log.productId?.name || 'A product'}</strong>
              <span className="block text-xs text-muted-foreground">
                {WORDS[log.type] || log.type}
                {log.reason ? ` · ${log.reason}` : ''}
                {log.orderId?.orderNumber ? ` · order ${log.orderId.orderNumber}` : ''}
                {' · '}
                {when(log.createdAt)}
              </span>
            </span>

            <span className={up ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
              {up ? '+' : ''}
              {log.quantity}
            </span>

            {/* Before and after, because the change alone does not say whether
                the count is now right. */}
            {log.stockBefore !== undefined && (
              <span className="w-28 text-right text-xs text-muted-foreground">
                {log.stockBefore} → {log.stockAfter ?? log.stockBefore + log.quantity}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
