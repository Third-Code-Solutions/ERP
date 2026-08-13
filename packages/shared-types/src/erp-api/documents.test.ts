import { describe, expect, it } from 'vitest'
import {
  documentDeleteBodySchema,
  documentDeleteCommandSchema,
  documentDeleteResultSchema,
} from './documents'

const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('document delete API contracts', () => {
  it('accepts an empty body and rejects browser-supplied fields', () => {
    expect(documentDeleteBodySchema.parse({})).toEqual({})
    expect(documentDeleteBodySchema.safeParse({ projectId: PROJECT_ID }).success).toBe(
      false
    )
  })

  it('requires a UUID document command', () => {
    expect(documentDeleteCommandSchema.parse({ documentId: DOCUMENT_ID })).toEqual({
      documentId: DOCUMENT_ID,
    })
    expect(documentDeleteCommandSchema.safeParse({ documentId: 'bad' }).success).toBe(
      false
    )
  })

  it('bounds and validates the durable replay result', () => {
    expect(
      documentDeleteResultSchema.parse({
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: `${TENANT_ID}/${PROJECT_ID}/drawing.dwg`,
        status: 'deleted',
        derivedScopeItemsRemoved: 2,
      })
    ).toMatchObject({ documentId: DOCUMENT_ID, status: 'deleted' })
    expect(
      documentDeleteResultSchema.safeParse({
        documentId: DOCUMENT_ID,
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        storagePath: 'x',
        status: 'deleted',
        derivedScopeItemsRemoved: -1,
      }).success
    ).toBe(false)
  })
})
