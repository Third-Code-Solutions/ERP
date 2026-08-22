import type { NextConfig } from 'next'
import path from 'node:path'

const config: NextConfig = {
  eslint: {
    // The monorepo's root flat-config gate is run explicitly before every
    // production build. Next's working-directory lint discovery cannot apply
    // that root-scoped config reliably, so avoid a second, incomplete pass.
    ignoreDuringBuilds: true,
  },
  output:
    process.env.NEXT_OUTPUT_MODE === 'standalone' ? 'standalone' : undefined,
  transpilePackages: ['@third-code-erp/auth', '@third-code-erp/database', '@third-code-erp/shared-types'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    // Keep static generation deterministic across constrained CI runners and
    // Windows workstations; page rendering remains request-parallel at runtime.
    cpus: 1,
    // CSV is capped at 2 MB before decoding; base64 transport adds ~33%.
    serverActions: {
      bodySizeLimit: '3mb',
    },
  },

  // Large, server-only parsers used by deterministic document intake.
  // Keeping them external lets Next.js skip bundling, and lets Vercel's
  // dependency tracer pull code plus OCR language assets from node_modules at
  // deploy time. The default upload route never calls a cloud model.
  serverExternalPackages: [
    '@napi-rs/canvas',
    'exceljs',
    'mammoth',
    'pdfjs-dist',
    'tesseract.js',
    '@tesseract.js-data/eng',
    'xlsx',
  ],

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
