/**
 * A template re-mounts on every navigation where a layout would not, which
 * is exactly the hook a route-entry animation needs (E3, 22 Sep 2026): the
 * new page rises 6px into place in 260 ms. `display: contents` keeps this
 * wrapper out of the layout - the flex column in app/layout.js still sees
 * <main> as its child. React's ViewTransition API would do the shared-element
 * version; it needs Next's experimental runtime, so not yet.
 */
export default function Template({ children }) {
  return <div className="page-enter contents">{children}</div>;
}
