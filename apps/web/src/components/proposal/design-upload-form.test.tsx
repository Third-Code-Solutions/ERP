import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DesignUploadForm } from './design-upload-form'

vi.mock('@/app/(dashboard)/crm/opportunities/[id]/proposal/actions', () => ({
  uploadDesignFile: vi.fn(),
}))

const documents = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    fileName: 'Ground floor plan.pdf',
    createdAt: '2026-09-06T04:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    fileName: 'Ground floor plan.pdf',
    createdAt: '2026-09-07T04:00:00.000Z',
  },
]

describe('DesignUploadForm', () => {
  it('offers uploaded documents by filename and date instead of asking for a UUID', () => {
    const markup = renderToStaticMarkup(
      <DesignUploadForm opportunityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" documents={documents} />,
    )

    expect(markup).toContain('Uploaded document')
    expect(markup).toContain('Ground floor plan.pdf · Sep 6, 2026')
    expect(markup).toContain('Ground floor plan.pdf · Sep 7, 2026')
    expect(markup).not.toContain('uploaded asset UUID')
    expect(markup).toContain('Create design file')
  })

  it('renders a clear prerequisite and project Documents link when no file exists', () => {
    const markup = renderToStaticMarkup(
      <DesignUploadForm
        opportunityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        projectId="11111111-1111-4111-8111-111111111111"
        documents={[]}
      />,
    )

    expect(markup).toContain('No uploaded documents are available for this opportunity.')
    expect(markup).toContain('href="/projects/11111111-1111-4111-8111-111111111111/documents"')
    expect(markup).toContain('disabled=""')
  })

  it('uses unique ids to associate labels across repeated forms', () => {
    const markup = renderToStaticMarkup(
      <>
        <DesignUploadForm opportunityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" documents={documents} />
        <DesignUploadForm opportunityId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" documents={documents} />
      </>,
    )
    const ids = [...markup.matchAll(/id="([^"]+)"/g)].map((match) => match[1])
    const labelTargets = [...markup.matchAll(/for="([^"]+)"/g)].map((match) => match[1])

    expect(new Set(ids).size).toBe(ids.length)
    expect(labelTargets.length).toBe(8)
    expect(labelTargets.every((target) => ids.includes(target))).toBe(true)
  })
})
