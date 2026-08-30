/**
 * The reference a human uses to talk about an order.
 *
 * Orders carry a readable `orderNumber` (SMP-260830-D649F4) that a customer can
 * read out on the phone and a seller can search for. Before it existed the UI
 * printed the raw Mongo ObjectId, which nobody can dictate or remember.
 *
 * The fallback exists for records created before order numbers, and for places
 * where the API returns only a partially populated order.
 */
export const orderRef = (order) => {
  if (order?.orderNumber) return order.orderNumber;

  const id = String(order?._id || order || '');
  return id ? `#${id.slice(-8).toUpperCase()}` : '—';
};

/**
 * Shorter form for tight spaces such as table cells and log rows: the trailing
 * segment alone is still unique enough to match against a full reference.
 */
export const orderRefShort = (order) => {
  if (order?.orderNumber) return order.orderNumber.split('-').pop();

  const id = String(order?._id || order || '');
  return id ? id.slice(-6).toUpperCase() : '—';
};
