/**
 * What a screen says when it has nothing to show.
 *
 * The admin dashboard reserves 380 pixels for a revenue chart and, with no
 * sales in the last week, fills all of it with the words "No revenue data for
 * last 7 days". That is a dead end dressed as a feature.
 *
 * An empty screen is an invitation to act. Say what is missing, say why in one
 * short line when the reason is not obvious, and offer the action that fills it
 * where one exists. Where nothing can be done - a chart with no sales yet -
 * stay small and quiet rather than filling the space.
 */
export default function EmptyState({ title, hint, action, className = '' }) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center text-center',
        'py-10 px-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="text-sm text-gray-500 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
