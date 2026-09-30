/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El prototipo se puede embeber como iframe dentro del Helios Angular (igual que
  // nextjs_helios_dispatch). Por eso no se fija X-Frame-Options: DENY.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
    ];
  },
};

export default nextConfig;
