import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { landingFaqs } from '@/components/marketing/abi-ops-content'
import { AbiOpsLanding } from '@/components/marketing/abi-ops-landing'
import { publicUrl } from '@/lib/public-origin'

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

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': publicUrl('/#organization'),
      name: 'Actuate Builders Inc.',
      url: publicUrl('/'),
    },
    {
      '@type': 'SoftwareApplication',
      '@id': publicUrl('/#software'),
      name: 'ABI OPS',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Construction management and enterprise resource planning',
      operatingSystem: 'Web',
      description:
        'A connected construction operating system for pipeline, projects, procurement, cost, billing, compliance, and permission-aware operational intelligence.',
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
