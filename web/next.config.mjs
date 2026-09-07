/** @type {import('next').NextConfig} */
const nextConfig = {
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
  async redirects() {
    return [
      { source: '/customer/orders', destination: '/orders', permanent: true },
      { source: '/customer/orders/:orderId', destination: '/orders/:orderId', permanent: true },
      { source: '/customer/cart', destination: '/cart', permanent: true },
      { source: '/customer/checkout', destination: '/checkout', permanent: true },
      // The old customer home was a dashboard of links. Orders is what people
      // actually opened it for.
      { source: '/customer/dashboard', destination: '/orders', permanent: true },
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
