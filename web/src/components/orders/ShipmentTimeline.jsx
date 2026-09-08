import { readable, hasLeftTheSeller } from '@/lib/courierText';

/**
 * Where the parcel is, and when it will arrive.
 *
 * WHAT THE MARKET SAYS THIS PAGE OWES A CUSTOMER
 *   Baymard's order-tracking research lists six details, and found only 33% of
 *   tested sites provide all six: the expected delivery date, a status progress
 *   indicator, the carrier's name, a LINKED tracking number, the detailed
 *   shipping history, and what is in the parcel. It also found that sending
 *   people off to the courier's own site loses control of the experience -
 *   "I like that this is built right in; I don't have to copy the tracking
 *   number".
 *
 *   Separately: 25% of sites fail to reliably show an expected delivery date,
 *   the detail users cite most. Ours was in the database the whole time -
 *   Shiprocket sends `etd` on every tracking event and applyCourierUpdate
 *   stores it as `expectedDeliveryAt` - and the page never showed it.
 *
 * WHY THE HISTORY IS BUILT FROM SCANS AND NOT FROM THE STATUS
 *   Carried over from the React app, which had this right. Four dots coloured
 *   from `order.status` say the same thing whether the parcel left an hour ago
 *   or has sat in a hub for three days - which is exactly when somebody looks.
 *   The courier records every stop with a time and a place; this shows what
 *   actually happened, and where there are no scans yet it falls back to the
 *   moments we know from our own records rather than inventing plausible ones.
 *
 * WHY THERE IS A STEPPER AS WELL
 *   The progress indicator and the scan list answer different questions: how
 *   far along, and what happened. Amazon and Flipkart show both. This stepper
 *   reads the FULFILMENT's status, so in a split order it describes this
 *   parcel rather than the slowest one in the basket.
 */
const STEPS = ['pending', 'processing', 'shipped', 'delivered'];

const STEP_WORDS = {
  pending: 'Placed',
  processing: 'Being packed',
  shipped: 'On its way',
  delivered: 'Delivered',
};

/**
 * What has not happened yet.
 *
 * `shipped` has TWO different next steps and they are not interchangeable.
 * `shippedAt` is set when the seller BOOKS a courier, and the courier's first
 * scan only says their system has the manifest - the parcel is on a shelf for
 * both. Until a scan shows real movement the next thing is collection, not
 * delivery. Saying "out for delivery" there tells somebody their parcel is
 * minutes away while it sits in a house.
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

const onDay = (date) =>
  new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

export default function ShipmentTimeline({ order, fulfilment }) {
  const parcel = fulfilment || {};
  const scans = Array.isArray(parcel.scans) ? parcel.scans : [];

  /*
   * Real scans if the courier has sent any. Otherwise the moments we know
   * ourselves - honest, and better than a row of grey dots that mean nothing.
   */
  const events = scans.length
    ? scans
        .filter((s) => s.at)
        .map((s) => ({ at: s.at, label: readable(s.activity), place: s.location }))
    : [
        parcel.deliveredAt && { at: parcel.deliveredAt, label: 'Delivered' },
        // NOT "handed to the courier": shippedAt is when the seller booked one.
        parcel.shippedAt && { at: parcel.shippedAt, label: 'Courier booked' },
        order?.createdAt && { at: order.createdAt, label: 'Order placed' },
      ].filter(Boolean);

  const sorted = [...events].sort((a, b) => new Date(b.at) - new Date(a.at));
  const next = nextStepFor(parcel.status, scans);

  const stepIndex = STEPS.indexOf(parcel.status);
  const stopped = ['cancelled', 'returned'].includes(parcel.status);

  return (
    <div className="space-y-4">
      {/* The expected delivery date first, because it is the question
          underneath "where is it". Only the courier's own estimate is shown -
          we do not compute one here, because a date we invented is a promise
          nobody made. */}
      {parcel.expectedDeliveryAt && parcel.status !== 'delivered' && !stopped && (
        <p className="text-sm">
          Arriving by <strong>{onDay(parcel.expectedDeliveryAt)}</strong>
          <span className="block text-xs text-muted-foreground">
            The courier&rsquo;s own estimate, updated with every scan.
          </span>
        </p>
      )}

      {/* How far along. Hidden once an order is cancelled or returned, where a
          progress bar would be describing a journey that stopped. */}
      {!stopped && stepIndex >= 0 && (
        <ol className="flex gap-1" aria-label="Progress">
          {STEPS.map((step, i) => (
            <li key={step} className="flex-1">
              <span
                className={`block h-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
                aria-hidden="true"
              />
              <span
                className={`mt-1 block text-[11px] ${
                  i <= stepIndex ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {STEP_WORDS[step]}
              </span>
            </li>
          ))}
        </ol>
      )}

      {(sorted.length > 0 || next) && (
        <ol className="relative">
          {next && (
            <li className="relative pb-5 pl-6">
              <span
                className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-border bg-background"
                aria-hidden="true"
              />
              <span
                className="absolute bottom-0 left-[4.5px] top-5 w-px bg-border"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">{next}</p>
            </li>
          )}

          {sorted.map((event, i) => (
            <li key={`${event.at}-${i}`} className="relative pb-5 pl-6 last:pb-0">
              {/* The most recent thing that actually happened is filled in. */}
              <span
                className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${
                  i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'
                }`}
                aria-hidden="true"
              />
              {i < sorted.length - 1 && (
                <span
                  className="absolute bottom-0 left-[4.5px] top-5 w-px bg-border"
                  aria-hidden="true"
                />
              )}

              <p className={i === 0 ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
                {event.label}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {when(event.at)}
                {event.place ? ` · ${readable(event.place)}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
