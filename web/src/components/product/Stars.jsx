/**
 * A rating, drawn.
 *
 * Server component, no icon library: five inline SVGs weigh less than the
 * import would, and this appears on every card in a grid.
 */
export default function Stars({ value = 0, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 20 20" className="h-4 w-4">
          <path
            d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L1.5 7.7l5.9-.9z"
            fill="currentColor"
            className={n <= Math.round(value) ? 'text-primary' : 'text-muted'}
          />
        </svg>
      ))}
    </span>
  );
}
