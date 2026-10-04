import '@/lib/env'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { resolvePublicOrigin } from '@/lib/public-origin'
import './globals.css'
import './workspace.css'

export const metadata: Metadata = {
  metadataBase: resolvePublicOrigin(),
  title: {
    template: '%s | ABI OPS',
    default: 'ABI OPS',
  },
  description:
    'ABI OPS is a connected operating system for construction pipeline, projects, procurement, cost, billing, compliance, and operational intelligence.',
  applicationName: 'ABI OPS',
  authors: [{ name: 'Actuate Builders Inc.' }],
  creator: 'Actuate Builders Inc.',
  publisher: 'Actuate Builders Inc.',
  category: 'business software',
  keywords: [
    'construction ERP',
    'construction management software',
    'project cost control',
    'construction procurement',
    'contractor billing',
    'Philippines construction software',
    'AI operations platform',
  ],
  // No `robots` here on purpose. A permissive `index, follow` declared at the
  // root is inherited by /_not-found, which Next.js already renders with its own
  // `noindex` — producing a 404 that told crawlers both to index and not to
  // index it. Indexable surfaces declare their own robots metadata; gated
  // surfaces are excluded in robots.txt.
}

// Reading the per-request nonce from headers() opts the entire route tree
// into dynamic rendering. Without it, Next.js prerenders pages at build time
// and serves HTML whose <script> tags carry no nonce — every framework script
// is then blocked by the strict CSP we set in middleware.ts. The nonce itself
// is consumed by Next.js internals when present in the request CSP header;
// reading it here is what triggers per-request render + nonce injection.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await headers()

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>
        {children}
        {process.env.VERCEL === '1' ? <Analytics /> : null}
        {process.env.VERCEL === '1' ? <SpeedInsights /> : null}
      </body>
    </html>
  )
}
