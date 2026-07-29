import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { landingFaqs } from '@/components/marketing/third-code-content'
import { ThirdCodeLanding } from '@/components/marketing/third-code-landing'
import { publicUrl } from '@/lib/public-origin'

export const metadata: Metadata = {
  title: 'Construction ERP with a permission-aware AI brain',
  description:
    'Third Code ERP connects pipeline, projects, procurement, cost, billing, compliance, and evidence in one construction operating system.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
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

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': publicUrl('/#organization'),
      name: 'Third Code Solutions Inc.',
      url: publicUrl('/'),
    },
    {
      '@type': 'SoftwareApplication',
      '@id': publicUrl('/#software'),
      name: 'Third Code ERP',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Construction management and enterprise resource planning',
      operatingSystem: 'Web',
      description:
        'A connected construction ERP for pipeline, projects, procurement, cost, billing, compliance, and permission-aware operational intelligence.',
      provider: {
        '@id': publicUrl('/#organization'),
      },
      featureList: [
        'Construction pipeline and client management',
        'Project planning and site execution',
        'Drawings, takeoffs, bills of materials, and procurement',
        'Cost control, billing, retention, and compliance',
        'Permission-aware AI search with cited source records',
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': publicUrl('/#faq'),
      mainEntity: landingFaqs.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    },
  ],
}

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
