/**
 * Ask the Next server to drop a cache tag (2.56, 21 Sep 2026) - called after an
 * admin saves Settings so the home page and the announcement bar change at
 * once. Fire-and-forget, never awaited by the request: a web server that is
 * down or unconfigured must not make a Settings save fail. Needs
 * WEB_REVALIDATE_TOKEN (same value as REVALIDATE_TOKEN on the web) and
 * WEB_INTERNAL_URL (http://web:3000 in compose); without them it does nothing
 * and the web's 30-second cache floor covers it.
 */
const webRevalidate = (tag = 'settings') => {
  const token = (process.env.WEB_REVALIDATE_TOKEN || '').trim();
  const base = (process.env.WEB_INTERNAL_URL || '').replace(/\/+$/, '');
  if (!token || !base || typeof fetch !== 'function') return;
  fetch(`${base}/_revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-token': token },
    body: JSON.stringify({ tag }),
    signal: AbortSignal.timeout(3000),
  }).then((r) => {
    if (!r.ok) console.warn(`web revalidate(${tag}) answered ${r.status}`);
  }).catch((err) => console.warn(`web revalidate(${tag}) failed: ${err.message}`));
};

module.exports = { webRevalidate };
