/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle a self-contained Node server so `timo start` can run from any install path.
  output: 'standalone',
  devIndicators: false,
  serverExternalPackages: ['sql.js', 'chrome-cookies-secure', 'keytar'],
  outputFileTracingIncludes: {
    '**/*': [
      './node_modules/sql.js/dist/sql-wasm.wasm',
      './node_modules/keytar/build/Release/keytar.node',
    ],
  },
};

export default nextConfig;
