import { revalidateTag } from 'next/cache';

/**
 * POST /_revalidate  { tag }   header: x-revalidate-token
 *
 * The API calls this the moment an admin saves Settings (2.56, 21 Sep 2026),
 * so the home page and the announcement bar change at once instead of after
 * the cache window - Shopify's theme editor is immediate and that is what the
 * person saving expects. Lives outside /api on purpose: Caddy sends /api/* to
 * the API container, and the dev proxy rewrites it too.
 *
 * Shared secret: REVALIDATE_TOKEN here (env/web.env on the box) and the same
 * value as WEB_REVALIDATE_TOKEN on the API. Unset = 404, as if the route did
 * not exist; the 30-second cache floor covers the gap.
 */
export async function POST(request) {
  const expected = (process.env.REVALIDATE_TOKEN || '').trim();
  if (!expected) return new Response('Not found', { status: 404 });
  const given = request.headers.get('x-revalidate-token') || '';
  if (given.length !== expected.length || given !== expected) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({}));
  const tag = String(body.tag || 'settings').slice(0, 40);
  if (!/^[a-z-]+$/.test(tag)) return Response.json({ message: 'bad tag' }, { status: 400 });
  revalidateTag(tag);
  return Response.json({ revalidated: tag, at: new Date().toISOString() });
}
