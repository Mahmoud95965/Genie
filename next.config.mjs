/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Legacy non-locale URLs (from before the EN/AR restructure) redirect
  // to their English versions instead of 404ing.
  async redirects() {
    return [
      { source: "/work", destination: "/en/work", permanent: true },
      { source: "/about", destination: "/en/about", permanent: true },
      { source: "/contact", destination: "/en/contact", permanent: true },
      { source: "/work/:slug", destination: "/en/work/:slug", permanent: true },
    ];
  },
};
export default nextConfig;
