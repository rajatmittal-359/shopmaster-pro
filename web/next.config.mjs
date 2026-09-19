/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * Development only (Next ignores this in production): the dev server refuses
   * its own scripts to a page opened from another host, and a phone on the
   * same Wi-Fi opening http://192.168.1.37:3000 got a page that never hydrated
   * - the sign-in form posted itself as plain HTML (13 Sep 2026). Private LAN
   * ranges are listed so the laptop's address may change.
   */
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.16.*.*', '172.17.*.*', '172.18.*.*', '172.19.*.*', '172.2*.*.*', '172.30.*.*', '172.31.*.*'],
  images: {
    /*
     * Product images live on Cloudinary. next/image refuses any host not named
     * here on purpose - without the list, anyone could point our optimiser at
     * any URL on the internet and we would pay to resize it for them.
     */
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
    /*
     * Jewellery is bought on the strength of the photograph, and a shopper
     * pinch-zooms to see the stone. Long cache because these files never change
     * - Cloudinary gives every upload its own URL.
     */
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  /*
   * The React app's URLs, kept alive.
   *
   * Rajat is deleting `frontend/` once this covers it, and the day the domain
   * points here every bookmark, every emailed link and every WhatsApp message
   * carrying /customer/orders still has to land somewhere. These are behind a
   * login so there is no ranking to preserve - but a customer who bookmarked
   * their orders page and gets a 404 has no way of knowing the shop still
   * works.
   *
   * `permanent: true` (308) because these are not coming back. The old paths
   * are retired, not moved for a week.
   */
  /*
   * The sitemap has to live on the SHOP'S domain, not the API's.
   *
   * Google accepts a sitemap for URLs on the host that serves it; a sitemap on
   * shopmaster-api-sg.onrender.com listing shopmasterpro.in pages is a
   * cross-domain sitemap, which needs BOTH hosts verified in Search Console
   * before it counts. Proxying it here means /sitemap.xml is on the right
   * domain and still generated live from the database - and it removes the
   * Render rewrite that was sitting on the manual list.
   */
  async rewrites() {
    const api = (process.env.NEXT_PUBLIC_API_URL || 'https://shopmaster-api-sg.onrender.com/api')
      .replace(/\/api$/, '');

    return [
      { source: '/sitemap.xml', destination: `${api}/sitemap.xml` },
      /*
       * The API, first-party (19 Sep 2026 - sessions). The browser calls
       * /api/* on THIS host and Next proxies it to the API service, so the
       * session cookies the API sets are same-site cookies: httpOnly, Secure,
       * SameSite=Lax, never visible to a script, never blocked by Safari as
       * third-party. Server components keep calling the API directly (no
       * hop). It also does what /dev-api did: a phone on the same Wi-Fi
       * reaches the laptop on :3000 but not :5000.
       */
      { source: '/api/:path*', destination: `${api}/api/:path*` },
    ];
  },

  async redirects() {
    return [
      { source: '/customer/orders', destination: '/orders', permanent: true },
      { source: '/customer/orders/:orderId', destination: '/orders/:orderId', permanent: true },
      { source: '/customer/cart', destination: '/cart', permanent: true },
      { source: '/customer/checkout', destination: '/checkout', permanent: true },
      // The old customer home was a dashboard of links. Orders is what people
      // actually opened it for.
      { source: '/customer/dashboard', destination: '/orders', permanent: true },
      { source: '/customer/addresses', destination: '/addresses', permanent: true },
      { source: '/customer/wishlist', destination: '/wishlist', permanent: true },
      { source: '/customer/orders/:orderId/bill', destination: '/orders/:orderId/bill', permanent: true },
      { source: '/seller/dashboard', destination: '/seller', permanent: true },
      { source: '/admin/dashboard', destination: '/admin', permanent: true },
      { source: '/admin/manage-sellers', destination: '/admin/sellers', permanent: true },
      { source: '/admin/inventory-logs', destination: '/admin/inventory', permanent: true },
      { source: '/seller/inventory-logs', destination: '/seller/inventory', permanent: true },
      // Verifying is a step inside creating an account here, not its own page.
      { source: '/verify-otp', destination: '/register', permanent: true },
    ];
  },
};

export default nextConfig;
