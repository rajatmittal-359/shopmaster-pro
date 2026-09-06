import { readable, hasLeftTheSeller } from '../../utils/courierText';

/**
 * Where the parcel has been, and where it is going next.
 *
 * WHY IT IS BUILT FROM SCANS AND NOT FROM THE STATUS
 *   The page used to draw four dots and colour them from `order.status`. Four
 *   dots are not a journey: they say the same thing whether the parcel left an
 *   hour ago or has been sitting in a hub for three days, which is exactly when
 *   somebody wants to look.
 *
 *   The courier records every stop with a time and a place, and the webhook now
 *   keeps them. So this shows what actually happened - and nothing else. Where
 *   there are no scans yet it falls back to the three moments we know for
 *   certain from our own records rather than inventing plausible ones.
 *
 * WHY THE NEXT STEP IS SHOWN AT ALL
 *   A list of what has happened leaves the reader to work out what is left.
 *   One greyed line saying what comes next answers that without adding noise -
 *   and it disappears once the parcel arrives, because then nothing is next.
 */

/**
 * What has not happened yet.
 *
 * `shipped` has TWO different next steps and they are not interchangeable.
 * Our shippedAt is set when the seller BOOKS a courier, and the courier's first
 * scan only says their system has the manifest - the parcel is on a shelf for
 * both. Until a scan shows real movement (see hasLeftTheSeller) the next thing
 * is collection, not delivery. Saying "out for delivery" there tells a customer
 * their parcel is minutes away while it sits in a house.
 */
const nextStepFor = (status, scans) => {
  if (status === 'pending' || status === 'processing') return 'Seller is preparing it';
  if (status === 'shipped') {
    return hasLeftTheSeller(scans) ? 'Out for delivery' : 'Waiting to be collected';
  }
  return null;
};

const when = (date) =>
  new Date(date).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

export default function ShipmentTimeline({ order, fulfilment }) {
  const f = fulfilment || {};
  const scans = Array.isArray(f.scans) ? f.scans : [];

  /*
   * Real scans if the courier has sent any. Otherwise the moments we know
   * ourselves - honest, and better than a row of grey dots that mean nothing.
   */
  const events = scans.length
    ? scans
        .filter((s) => s.at)
        .map((s) => ({ at: s.at, label: readable(s.activity), place: s.location }))
    : [
        f.deliveredAt && { at: f.deliveredAt, label: 'Delivered' },
        // NOT "handed to the courier": shippedAt is when the seller booked one.
        // The parcel is still with them until a collection scan says otherwise.
        f.shippedAt && { at: f.shippedAt, label: 'Courier booked' },
        order?.createdAt && { at: order.createdAt, label: 'Order placed' },
      ].filter(Boolean);

  const sorted = [...events].sort((a, b) => new Date(b.at) - new Date(a.at));
  const next = nextStepFor(order?.status, scans);

  if (!sorted.length && !next) return null;

  return (
    <ol className="relative">
      {next && (
        <li className="relative pl-6 pb-5">
          <span
            className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2
                       border-gray-300 bg-white"
            aria-hidden
          />
          <span
            className="absolute left-[4.5px] top-5 bottom-0 w-px bg-gray-200"
            aria-hidden
          />
          <p className="text-sm text-gray-400">{next}</p>
        </li>
      )}

      {sorted.map((e, i) => (
        <li key={`${e.at}-${i}`} className="relative pl-6 pb-5 last:pb-0">
          {/* The most recent thing that actually happened is the one filled in. */}
          <span
            className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full ${
              i === 0 ? 'bg-brand-fill' : 'bg-gray-300'
            }`}
            aria-hidden
          />
          {i < sorted.length - 1 && (
            <span
              className="absolute left-[4.5px] top-5 bottom-0 w-px bg-gray-200"
              aria-hidden
            />
          )}

          <p className={i === 0 ? 'text-sm font-medium text-gray-900' : 'text-sm text-gray-700'}>
            {e.label}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {when(e.at)}
            {e.place ? ` · ${readable(e.place)}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
