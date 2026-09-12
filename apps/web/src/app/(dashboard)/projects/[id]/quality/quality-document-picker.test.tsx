import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectDocumentRow } from '@third-code-erp/shared-types'
import { QualityDocumentPicker } from './quality-document-picker'

const load = vi.hoisted(() => vi.fn())
vi.mock('./document-actions', () => ({ listQualityProjectDocuments: load }))
const projectId = '33333333-3333-4333-8333-333333333333'
const document: ProjectDocumentRow = {
  id: '44444444-4444-4444-8444-444444444444', projectId, fileName: 'Structural detail.pdf',
  documentType: 'other', mimeType: 'application/pdf', sizeBytes: 123,
  description: null, createdAt: '2026-09-13T00:00:00.000Z',
}

describe('QualityDocumentPicker initial render', () => {
  it('is optional, lazy and does not expose UUID entry or invent approval', () => {
    const html = renderToStaticMarkup(<QualityDocumentPicker projectId={projectId} value={null} onChange={vi.fn()} />)
    expect(html).toContain('Choose project document')
    expect(html).toContain('name="planDocumentId" value=""')
    expect(html).toContain('No project document selected')
    expect(html).not.toMatch(/approved|version|type="text"/i)
    expect(load).not.toHaveBeenCalled()
  })

  it('keeps the selected document summary independent of loaded pages', () => {
    const html = renderToStaticMarkup(<QualityDocumentPicker projectId={projectId} value={document} onChange={vi.fn()} />)
    expect(html).toContain('Structural detail.pdf')
    expect(html).toContain(`name="planDocumentId" value="${document.id}"`)
    expect(html).toContain('Clear selection')
    expect(load).not.toHaveBeenCalled()
  })

  it('never submits another project document and explains the invalid scope', () => {
    const html = renderToStaticMarkup(<QualityDocumentPicker projectId={projectId} value={{ ...document, projectId: '55555555-5555-4555-8555-555555555555' }} onChange={vi.fn()} />)
    expect(html).toContain('name="planDocumentId" value=""')
    expect(html).toContain('role="alert"')
    expect(html).toContain('does not belong to this project')
    expect(html).not.toContain(document.id)
  })

  it('rejects a malformed selected identifier even with matching project', () => {
    const html = renderToStaticMarkup(<QualityDocumentPicker projectId={projectId} value={{ ...document, id: 'not-a-uuid' }} onChange={vi.fn()} />)
    expect(html).toContain('name="planDocumentId" value=""')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('value="not-a-uuid"')
  })

  it('disables native selection controls without discarding the selected hidden value', () => {
    const html = renderToStaticMarkup(<QualityDocumentPicker projectId={projectId} value={document} onChange={vi.fn()} disabled />)
    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).toContain(`name="planDocumentId" value="${document.id}"`)
    expect(html).toContain('type="button"')
  })
})
