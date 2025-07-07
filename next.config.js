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
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' blob:",
              "worker-src 'self' blob:",
              "connect-src 'self' blob:",
              "img-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
            ].join('; ')
          }
        ]
      },
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
