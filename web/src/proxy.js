import { NextResponse } from 'next/server';

/**
 * The one redirect next.config cannot express (plan 2.15, cutover).
 *
 * The old React app linked every product by its Mongo id -
 * /products/6aa59aaf… - and Google indexed those. The new page is
 * /products/<slug>. A static redirect table cannot map an id to a slug, and
 * a redirect from the page itself arrives too late: the segment has a
 * loading boundary, so the shell streams as a 200 before the page can
 * throw. So it happens here, before any rendering: one small call to the
 * API for the slug, then a 308. Only ids match; slugs never reach this.
 */
const API = (process.env.NEXT_PUBLIC_API_URL || 'https://shopmaster-api-sg.onrender.com/api').replace(/\/$/, '');
const MONGO_ID = /^\/products\/([0-9a-f]{24})\/?$/i;

export async function proxy(request) {
  /*
   * The live-API drill (20 Sep 2026): pointing this dev server at the Render
   * API to test the Razorpay webhook path, the API refused every call with
   * "Origin not allowed: http://localhost:3000" - the /api rewrite forwards the
   * browser's Origin, and the deployed API rightly does not list localhost.
   * A request with NO Origin is what the API treats as server-to-server, which
   * is exactly what the proxied hop is. Dropped only outside production; the
   * deployed web host is in the API's list and keeps sending it.
   */
  if (process.env.NODE_ENV !== 'production' && request.nextUrl.pathname.startsWith('/api/')) {
    const headers = new Headers(request.headers);
    headers.delete('origin');
    return NextResponse.next({ request: { headers } });
  }

  const m = MONGO_ID.exec(request.nextUrl.pathname);
  if (!m) return NextResponse.next();
  try {
    const res = await fetch(`${API}/public/products/${m[1]}`, { headers: { accept: 'application/json' }, next: { revalidate: 3600 } });
    if (!res.ok) return NextResponse.next();
    const data = await res.json();
    const slug = data?.product?.slug;
    if (!slug || slug === m[1]) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/products/${slug}`;
    return NextResponse.redirect(url, 308);
  } catch {
    // The API is down or slow: render the page by id rather than fail the request.
    return NextResponse.next();
  }
}

export const config = {
  matcher: ['/products/:id', '/api/:path*'],
};
