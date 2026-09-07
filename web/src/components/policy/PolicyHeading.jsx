/** The heading and "last updated" line every policy page opens with. */
export default function PolicyHeading({ title, updated }) {
  return (
    <header>
      <h1>{title}</h1>
      {updated && <p className="mt-1 text-xs">Last updated {updated}</p>}
    </header>
  );
}
