/*
 * ShopMaster Pro service worker - push only (plan 2.26).
 *
 * No caching, no offline: the panel is a live view of orders and a stale
 * copy would lie. This file exists so the browser can wake us for a push
 * and open the right page when the seller taps it.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'ShopMaster Pro', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'ShopMaster Pro';
  const options = {
    body: data.body || '',
    icon: '/brand/mark-192.png',
    badge: '/brand/mark-64.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { url: data.url || '/seller' },
    lang: 'hi-IN',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/seller', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.focus().then((c) => (c.navigate ? c.navigate(url) : null));
      return self.clients.openWindow(url);
    })
  );
});
