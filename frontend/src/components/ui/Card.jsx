/**
 * The white panel everything sits on.
 *
 * Written out by hand on nearly every screen, with the padding and the shadow
 * drifting a little each time. One place now, so a change to the surface is a
 * change everywhere.
 *
 * `title` and `hint` are here because the pattern - a heading with a quiet line
 * of explanation under it - already appears on the dashboards, and rebuilding
 * it per screen is how the type sizes started disagreeing.
 */
export default function Card({
  title,
  hint,
  actions,
  padded = true,
  className = '',
  children,
}) {
  return (
    <section
      className={[
        'bg-white rounded-xl border border-gray-200',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div>
            {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
            {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}

      <div className={padded ? 'px-5 pb-5 pt-0' : ''}>{children}</div>
    </section>
  );
}
