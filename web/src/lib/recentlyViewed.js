/**
 * Recently viewed (E4, 22 Sep 2026): the last twelve product ids this
 * browser opened, newest first, in localStorage - no account needed, nothing
 * sent anywhere. Amazon's "Your recently viewed items" is the strip shoppers
 * use most after search; Baymard puts it in the top four ways back to a
 * product. The cards come from GET /public/products/by-ids, which drops
 * anything no longer for sale.
 */
const KEY = 'smp_recent';
const MAX = 12;

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const recentIds = () => (typeof window === 'undefined' ? [] : read());

export const recordView = (id) => {
  if (typeof window === 'undefined' || !id) return;
  try {
    const next = [String(id), ...read().filter((x) => x !== String(id))].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* private mode: no memory, no harm */ }
};
