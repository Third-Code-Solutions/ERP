import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { landingFaqs } from '@/components/marketing/third-code-content'
import { ThirdCodeLanding } from '@/components/marketing/third-code-landing'
import { publicUrl } from '@/lib/public-origin'
import { buildLandingStructuredData } from '@/lib/landing-structured-data'

export const metadata: Metadata = {
  title: 'Construction ERP with a permission-aware AI brain',
  description:
    'Third Code ERP connects pipeline, projects, procurement, cost, billing, compliance, and evidence in one construction operating system.',
  alternates: {
    canonical: '/',
    languages: { 'en-PH': '/' },
  },
  openGraph: {
    type: 'website',
    siteName: 'Third Code ERP',
    locale: 'en_PH',
    title: 'Third Code ERP | One operating system for every project',
    description:
      'Run construction work from opportunity to turnover with connected records, controlled approvals, and a permission-aware AI brain.',
    url: '/',
    images: [
      {
        url: '/images/third-code-erp-hero.png',
        width: 1536,
        height: 1024,
        alt: 'Third Code ERP construction command center',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Third Code ERP | Construction operations, connected',
    description:
      'Pipeline, projects, procurement, cost, billing, compliance, and evidence in one calm operating system.',
    images: ['/images/third-code-erp-hero.png'],
  },
}

const structuredData = buildLandingStructuredData(publicUrl('/'), landingFaqs)

export default async function RootPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <>
      <ThirdCodeLanding />
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
