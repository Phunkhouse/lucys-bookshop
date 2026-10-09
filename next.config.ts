import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Lets a phone on the home network open `pnpm dev` through the Mac's IP
  // address. Dev server only; has no effect on a production build.
  allowedDevOrigins: ['192.168.*.*'],
  sassOptions: {
    loadPaths: ['src/styles'],
  },
}

export default withNextIntl(nextConfig)
