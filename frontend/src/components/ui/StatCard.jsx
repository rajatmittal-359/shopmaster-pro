/**
 * One number, with the words that make it honest.
 *
 * The admin and seller dashboards both build these by hand, and that is how
 * three of them ended up lying: "Orders Today" showed every order ever placed,
 * "Platform Revenue" showed gross sales rather than commission, and the seller's
 * "Active products" ran the same query as "Total products".
 *
 * So `hint` is not optional decoration - it is where the number says what it
 * actually counts. A number with no scope stated is a number waiting to be
 * misread.
 *
 * `secondary` carries the comparison that stops a figure being misunderstood:
 * commission is only meaningful beside the gross it came out of.
 */

const ACCENTS = {
  neutral: 'text-gray-900',
  brand: 'text-brand-700',
  info: 'text-blue-600',
  warning: 'text-amber-600',
  success: 'text-positive',
  danger: 'text-red-600',
};

/**
 * @param {string} label
 * @param {string|number} value
 * @param {string} [hint]       what this number counts, in plain words
 * @param {string} [secondary]  a comparison shown under the value
 * @param {'neutral'|'brand'|'info'|'warning'|'success'|'danger'} [accent]
 */
export default function StatCard({
  label,
  value,
  hint,
  secondary,
  accent = 'neutral',
  className = '',
}) {
  return (
    <div
      className={[
        'bg-white rounded-xl border border-gray-200 p-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="text-sm font-medium text-gray-600">{label}</p>

      <p className={`text-3xl font-bold mt-1.5 tabular-nums ${ACCENTS[accent] || ACCENTS.neutral}`}>
        {value}
      </p>

      {secondary && <p className="text-sm text-gray-600 mt-0.5 tabular-nums">{secondary}</p>}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}
