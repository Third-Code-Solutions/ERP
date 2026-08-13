export interface LandingFaq {
  question: string
  answer: string
}

export function buildLandingStructuredData(
  publicOrigin: string | URL,
  faqs: readonly LandingFaq[]
) {
  const url = (pathname: string) => new URL(pathname, publicOrigin).toString()
  const organizationId = url('/#organization')
  const websiteId = url('/#website')
  const webpageId = url('/#webpage')
  const softwareId = url('/#software')

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: 'Actuate Builders Inc.',
        url: url('/'),
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: 'ABI OPS',
        url: url('/'),
        inLanguage: 'en-PH',
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'WebPage',
        '@id': webpageId,
        name: 'Construction ERP with a permission-aware AI brain',
        url: url('/'),
        inLanguage: 'en-PH',
        isPartOf: { '@id': websiteId },
        about: { '@id': softwareId },
        primaryImageOfPage: url('/images/abi-ops-hero.png'),
        keywords:
          'construction ERP, construction management, project cost control, procurement, operational intelligence',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': softwareId,
        name: 'ABI OPS',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory:
          'Construction management and enterprise resource planning',
        operatingSystem: 'Web',
        image: url('/images/abi-ops-hero.png'),
        description:
          'A connected construction ERP for pipeline, projects, procurement, cost, billing, compliance, and permission-aware operational intelligence.',
        provider: { '@id': organizationId },
        audience: {
          '@type': 'BusinessAudience',
          audienceType: 'Construction companies and project-driven businesses',
        },
        areaServed: { '@type': 'Country', name: 'Philippines' },
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
        '@id': url('/#faq'),
        isPartOf: { '@id': websiteId },
        mainEntity: faqs.map((item) => ({
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
}
