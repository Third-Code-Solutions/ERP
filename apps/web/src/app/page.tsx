import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { landingFaqs } from '@/components/marketing/abi-ops-content'
import { AbiOpsLanding } from '@/components/marketing/abi-ops-landing'
import { buildLandingStructuredData } from '@/lib/landing-structured-data'
import { resolvePublicOrigin } from '@/lib/public-origin'

export const metadata: Metadata = {
  title: { absolute: 'ABI OPS | Construction operations, connected' },
  applicationName: 'ABI OPS',
  description:
    'ABI OPS connects pipeline, projects, procurement, cost, billing, compliance, and evidence in one construction operating system.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ABI OPS | One operating system for every project',
    description:
      'Run construction work from opportunity to turnover with connected records, controlled approvals, and permission-aware intelligence.',
    url: '/',
    images: [
      {
        url: '/images/abi-ops-hero.png',
        width: 1536,
        height: 1024,
        alt: 'ABI OPS construction operations workspace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ABI OPS | Construction operations, connected',
    description:
      'Pipeline, projects, procurement, cost, billing, compliance, and evidence in one calm operating system.',
    images: ['/images/abi-ops-hero.png'],
  },
}

export default async function RootPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  const structuredData = buildLandingStructuredData(
    resolvePublicOrigin(),
    landingFaqs,
  )

  return (
    <>
      <AbiOpsLanding />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
        nonce={nonce}
        suppressHydrationWarning
        type="application/ld+json"
      />
    </>
  )
}
