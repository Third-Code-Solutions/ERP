import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  attachClaimDocument: vi.fn(),
  listClaimDocuments: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('@/app/(dashboard)/claims/[id]/actions', () => ({
  attachClaimDocument: mocks.attachClaimDocument,
  listClaimDocuments: mocks.listClaimDocuments,
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

import {
  ClaimDocumentAttach,
  mergeClaimDocumentOptions,
  type ClaimDocumentOption,
} from './claim-document-attach'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555'
const OTHER_DOCUMENT_ID = '66666666-6666-4666-8666-666666666666'

const option = (
  id: string,
  fileName: string,
): ClaimDocumentOption => ({
  id,
  fileName,
  documentType: 'image',
})

describe('claim document attach selector', () => {
  it('retains a selected document when the current page no longer contains it', () => {
    const selected = option(DOCUMENT_ID, 'page-one-photo.jpg')

    expect(mergeClaimDocumentOptions([option(OTHER_DOCUMENT_ID, 'page-two.pdf')], selected)).toEqual([
      selected,
      option(OTHER_DOCUMENT_ID, 'page-two.pdf'),
    ])
    expect(mergeClaimDocumentOptions([selected], selected)).toEqual([selected])
  })

  it('renders a readable paginated selector without UUID-entry instructions', () => {
    const markup = renderToStaticMarkup(
      <ClaimDocumentAttach claimId={PROJECT_ID} />,
    )

    expect(markup).toContain('for="claim-document-id"')
    expect(markup).toContain('>Project document</label>')
    expect(markup).toContain('Loading project documents…')
    expect(markup).toContain('Attachment kind')
    expect(markup).toContain('Caption')
    expect(markup).not.toContain('Document UUID')
  })

  it('keeps terminal-state attachment controls disabled without loading a list', () => {
    const markup = renderToStaticMarkup(
      <ClaimDocumentAttach claimId={PROJECT_ID} disabled />,
    )

    expect(markup).toContain('disabled=""')
    expect(markup).toContain('Select a project document…')
    expect(markup).not.toContain('Loading project documents…')
    expect(mocks.listClaimDocuments).not.toHaveBeenCalled()
  })

  it('uses only semantic color tokens defined by the application theme', () => {
    const globals = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

    expect(globals).toContain('--color-surface:')
    expect(globals).toContain('--color-border-strong:')
    expect(globals).toContain('--color-danger-soft:')
    expect(globals).toContain('--color-success-soft:')
  })
})
