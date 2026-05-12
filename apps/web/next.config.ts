import type { NextConfig } from 'next'
import path from 'node:path'

const config: NextConfig = {
  transpilePackages: ['@buildops/auth', '@buildops/database', '@buildops/shared-types'],
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // Large, server-only parsers used by the scope-extraction pipeline.
  // Keeping them external lets Next.js skip bundling, and lets Vercel's
  // dependency tracer pull them from node_modules at deploy time.
  serverExternalPackages: ['exceljs', 'mammoth'],

  // Security headers are set per-request in middleware.ts (CSP is nonce-based).
  // next.config.ts headers() applies to static assets only and don't support nonces,
  // so we keep only the non-nonce headers here as a fallback for static routes.
  async headers() {
    return [
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
}

export default config
