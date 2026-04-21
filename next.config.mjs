/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle a self-contained Node server so `timo start` can run from any install path.
  output: 'standalone',
  devIndicators: false,
  serverExternalPackages: ['sql.js'],
  outputFileTracingIncludes: {
    '**/*': ['./node_modules/sql.js/dist/sql-wasm.wasm'],
  },
};

export default nextConfig;
