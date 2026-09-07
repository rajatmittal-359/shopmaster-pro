/**
 * A heading inside a policy page.
 *
 * Policy text is read rather than skimmed, so these pages get a real reading
 * measure and generous line height instead of the dense type the app UI uses.
 * The spacing lives in the policy layout; this is only the heading.
 */
export default function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
