/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist ships ESM + Node APIs that webpack mis-bundles in server routes;
  // require it at runtime instead (used by app/api/pdf for filing text extraction).
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
  },
};
module.exports = nextConfig;
