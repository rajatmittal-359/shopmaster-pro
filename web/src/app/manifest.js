/**
 * Web app manifest (plan 2.26).
 *
 * Exists for one reason today: iPhone shows push notifications only to a
 * site that was added to the Home Screen, and Safari offers that only when
 * a manifest is present. Android Chrome uses it for the same "Add to Home
 * screen" and for the icon on the notification. Nothing here caches or
 * works offline - the panel stays a live view.
 */
export default function manifest() {
  return {
    name: 'ShopMaster Pro',
    short_name: 'ShopMaster',
    description: 'A marketplace from Jaipur - shop, and run your shop.',
    start_url: '/seller',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4f3ab8',
    lang: 'en-IN',
    icons: [
      { src: '/brand/mark-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/mark-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/mark-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
