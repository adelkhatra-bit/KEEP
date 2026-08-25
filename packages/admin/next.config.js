/** @type {import('next').NextConfig} */
const previewBasePath = process.env.KEEP_ADMIN_BASE_PATH || ''

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  basePath: previewBasePath,
  assetPrefix: previewBasePath || undefined,
}

module.exports = nextConfig
