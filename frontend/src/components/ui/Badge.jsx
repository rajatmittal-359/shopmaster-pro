/**
 * A small pill that reports state.
 *
 * Colour here means STATE, not importance - the opposite of Button, where
 * colour means priority. That separation is deliberate: it is why blue reads
 * correctly on a "Shipped" badge and would be wrong on a button.
 *
 * The order scale follows the journey, so a customer can read progress from
 * colour alone without matching words:
 *
 *   pending     grey    nothing has happened yet
 *   processing  amber   the seller is packing
 *   shipped     blue    in transit, out of everyone's hands
 *   delivered   green   arrived
 *   cancelled   grey    ended, no money moved
 *   returned    red     came back, money moved the other way
 */

const TONES = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  success: 'bg-green-50 text-positive ring-green-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
};

/** Order and fulfilment statuses, mapped once so every screen agrees. */
const STATUS_TONE = {
  pending: 'neutral',
  processing: 'warning',
  shipped: 'info',
  delivered: 'success',
  cancelled: 'neutral',
  returned: 'danger',

  // Payment
  paid: 'success',
  failed: 'danger',
  refunded: 'warning',

  // Seller account
  approved: 'success',
  active: 'success',
  suspended: 'danger',
  rejected: 'danger',
};

/** Turn 'same_day' or 'PENDING' into 'Same day' / 'Pending'. */
const label = (value) => {
  const words = String(value).replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * @param {string} [status]  an order/payment/seller status - picks its own tone
 * @param {'neutral'|'info'|'warning'|'success'|'danger'} [tone]  overrides it
 * @param {React.ReactNode} [children]  overrides the generated label
 */
export default function Badge({ status, tone, children, className = '' }) {
  const resolved = tone || STATUS_TONE[String(status).toLowerCase()] || 'neutral';

  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5',
        'text-xs font-medium whitespace-nowrap',
        // A ring rather than a border: it does not add to the layout box, so
        // badges sitting in a row never shift by a pixel.
        'ring-1 ring-inset',
        TONES[resolved],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children ?? label(status)}
    </span>
  );
}
