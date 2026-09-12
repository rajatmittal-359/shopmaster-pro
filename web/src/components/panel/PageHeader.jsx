/**
 * The top of every panel page: what this page is, one line on what it is
 * for, and the page's one primary action on the right - the row Shopify's
 * admin and Amazon's Seller Central both open with.
 */
export default function PageHeader({ title, lead, action }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {lead && <p className="mt-1 text-sm text-muted-foreground">{lead}</p>}
      </div>
      {action}
    </div>
  );
}
