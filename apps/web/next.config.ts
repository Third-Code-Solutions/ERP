import type { NextConfig } from 'next'
import path from 'node:path'

const config: NextConfig = {
  // Do not advertise the framework in every response; it is free
  // reconnaissance for anyone fingerprinting the deployment.
  poweredByHeader: false,
  images: {
    // AVIF first: roughly half the bytes of the PNG sources for the same
    // visual result. `webp` stays as the fallback for browsers without AVIF.
    // A client that advertises neither (curl, most link previewers) still gets
    // the original PNG — that is the optimizer's documented behaviour, not a
    // misconfiguration.
    formats: ['image/avif', 'image/webp'],
  },
  // Resolve bookmarks before streaming starts; static destinations retain queries.
  async redirects() {
    return [
      { source: '/pipeline/board', destination: '/pipeline', permanent: true },
      { source: '/pipeline/conversion', destination: '/pipeline/list', permanent: true },
    ]
  },
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
  // The workbook reader starts this file as a child process by path
  // (src/lib/operations/integrations/takeoff-xlsx-reader.ts). No module
  // imports it, so the tracer must be told to ship it with the import route.
  outputFileTracingIncludes: {
    '/api/bom/takeoff-import': [
      './src/lib/operations/integrations/takeoff-xlsx-worker.cjs',
    ],
  },
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
          // Middleware does not run for these paths, so without these the
          // transport and framing policy was silently dropped on asset
          // responses while every HTML response enforced it.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default config
