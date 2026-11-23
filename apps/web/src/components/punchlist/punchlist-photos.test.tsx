import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock('@/app/(dashboard)/punchlist/actions', () => ({ addPunchlistPhoto: vi.fn() }))

import { PunchlistPhotos } from './punchlist-photos'

const IMAGE_DOC = '11111111-1111-4111-8111-111111111111'
const PDF_DOC = '22222222-2222-4222-8222-222222222222'
const HEIC_DOC = '33333333-3333-4333-8333-333333333333'

const PHOTOS = [
  {
    id: 'photo-1',
    document_id: IMAGE_DOC,
    file_name: 'crack-before.jpg',
    mime_type: 'image/jpeg',
    caption: 'Hairline crack',
    is_before: true,
    created_at: new Date('2026-11-01T00:00:00Z'),
  },
  {
    id: 'photo-2',
    document_id: PDF_DOC,
    file_name: 'inspection.pdf',
    mime_type: 'application/pdf',
    caption: null,
    is_before: false,
    created_at: new Date('2026-11-02T00:00:00Z'),
  },
  {
    id: 'photo-3',
    document_id: HEIC_DOC,
    file_name: 'phone.heic',
    mime_type: 'image/heic',
    caption: null,
    is_before: false,
    created_at: new Date('2026-11-03T00:00:00Z'),
  },
]

function render(canEdit: boolean): string {
  return renderToStaticMarkup(
    <PunchlistPhotos
      itemId="item-1"
      projectId="project-1"
      photos={PHOTOS}
      availableDocs={[{ id: 'doc-9', file_name: 'later.png' }]}
      canEdit={canEdit}
    />
  )
}

describe('PunchlistPhotos evidence', () => {
  it('links every file to the authenticated document route in a new tab', () => {
    const html = render(false)

    for (const documentId of [IMAGE_DOC, PDF_DOC, HEIC_DOC]) {
      expect(html).toContain(`href="/api/documents/${documentId}"`)
    }
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('shows a thumbnail only for formats a browser can draw', () => {
    const html = render(false)

    expect(html).toContain(`<img src="/api/documents/${IMAGE_DOC}"`)
    expect(html).toContain('alt="Hairline crack"')
    expect(html).not.toContain(`<img src="/api/documents/${PDF_DOC}"`)
    expect(html).not.toContain(`<img src="/api/documents/${HEIC_DOC}"`)
    expect(html.match(/<img /g)).toHaveLength(1)
  })

  it('hides the attach form when the viewer may not edit', () => {
    expect(render(false)).not.toContain('Choose photo')
    expect(render(true)).toContain('Choose photo')
  })
})
