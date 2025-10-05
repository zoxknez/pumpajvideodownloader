/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Uklanjamo externalDir da ne uvozimo desktop komponente
  // experimental: {
  //   externalDir: true,
  // },
};
module.exports = nextConfig;
