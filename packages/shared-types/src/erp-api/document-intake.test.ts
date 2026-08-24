import { describe, expect, it } from 'vitest'
import {
  documentIntakeRequestSchema,
  documentIntakeResultSchema,
} from './document-intake'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'

describe('document intake contract', () => {
  it('defaults MIME type and keeps command fields strict', () => {
    expect(
      documentIntakeRequestSchema.parse({
        storagePath: `${TENANT_ID}/${PROJECT_ID}/drawing.dwg`,
        projectId: PROJECT_ID,
        fileName: 'drawing.dwg',
        sizeBytes: 1,
      })
    ).toMatchObject({ mimeType: 'application/octet-stream' })

    expect(() =>
      documentIntakeRequestSchema.parse({
        storagePath: `${TENANT_ID}/${PROJECT_ID}/drawing.dwg`,
        projectId: PROJECT_ID,
        fileName: 'drawing.dwg',
        sizeBytes: 1,
        tenantId: TENANT_ID,
      })
    ).toThrow()
  })

  it('bounds the uploaded object size', () => {
    expect(() =>
      documentIntakeRequestSchema.parse({
        storagePath: `${TENANT_ID}/${PROJECT_ID}/large.bin`,
        projectId: PROJECT_ID,
        fileName: 'large.bin',
        sizeBytes: 100 * 1024 * 1024 + 1,
      })
    ).toThrow()
  })

  it('accepts an optional opportunity association without changing existing commands', () => {
    expect(
      documentIntakeRequestSchema.parse({
        storagePath: `${TENANT_ID}/${PROJECT_ID}/inspection-report.html`,
        projectId: PROJECT_ID,
        opportunityId: OPPORTUNITY_ID,
        fileName: 'inspection-report.html',
        sizeBytes: 1,
      })
    ).toMatchObject({ opportunityId: OPPORTUNITY_ID })

    expect(() =>
      documentIntakeRequestSchema.parse({
        storagePath: `${TENANT_ID}/${PROJECT_ID}/inspection-report.html`,
        projectId: PROJECT_ID,
        opportunityId: 'not-a-uuid',
        fileName: 'inspection-report.html',
        sizeBytes: 1,
      })
    ).toThrow()
  })

  it('requires a UUID project and bounded filename', () => {
    expect(() =>
      documentIntakeRequestSchema.parse({
        storagePath: 'not-scoped',
        projectId: 'bad',
        fileName: 'x'.repeat(256),
        sizeBytes: 1,
      })
    ).toThrow()
  })

  it('accepts created and replay results without extra authority fields', () => {
    const result = documentIntakeResultSchema.parse({
      documentId: '44444444-4444-4444-8444-444444444444',
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      storagePath: `${TENANT_ID}/${PROJECT_ID}/drawing.pdf`,
      documentType: 'pdf',
      status: 'created',
      created: false,
    })
    expect(result.created).toBe(false)
    expect(() => documentIntakeResultSchema.parse({ ...result, role: 'admin' })).toThrow()
  })
})
