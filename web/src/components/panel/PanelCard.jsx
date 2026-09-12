/**
 * The one card every panel page is built from - the same box the product
 * form uses, so a seller's whole side of the site is one material.
 */
export default function PanelCard({ title, lead, aside, className = '', children }) {
  return (
    <section className={`rounded-xl border bg-card p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {lead && <p className="mt-1 text-sm text-muted-foreground">{lead}</p>}
          </div>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
