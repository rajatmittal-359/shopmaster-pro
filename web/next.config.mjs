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
};

export default nextConfig;
