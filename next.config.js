/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/dicom-viewer',
  assetPrefix: '/dicom-viewer',
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    // Handle cornerstone.js and DICOM libraries
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }

    return config;
  },
  transpilePackages: ['cornerstonejs/core', 'cornerstonejs/tools'],
  async headers() {
    return [
      {
        source: '/api/dicom-file/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Origin, X-Requested-With, Content-Type, Accept',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
