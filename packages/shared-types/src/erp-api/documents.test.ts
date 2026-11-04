import { describe, expect, it } from 'vitest'
import {
  documentDeleteBodySchema,
  documentDeleteCommandSchema,
  documentDeleteResultSchema,
  isTenantScopedStoragePath,
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

describe('isTenantScopedStoragePath', () => {
  const OTHER_TENANT = '99999999-9999-4999-8999-999999999999'

  it('accepts an object key under the tenant prefix', () => {
    expect(
      isTenantScopedStoragePath(`${TENANT_ID}/${PROJECT_ID}/abc-plan.dxf`, TENANT_ID)
    ).toBe(true)
  })

  it('rejects a foreign tenant prefix or a missing tenant', () => {
    expect(
      isTenantScopedStoragePath(`${OTHER_TENANT}/${PROJECT_ID}/plan.dxf`, TENANT_ID)
    ).toBe(false)
    expect(isTenantScopedStoragePath(`${TENANT_ID}x/plan.dxf`, TENANT_ID)).toBe(false)
    expect(isTenantScopedStoragePath('/plan.dxf', '')).toBe(false)
  })

  it.each([
    `${TENANT_ID}/../${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/./plan.dxf`,
    `${TENANT_ID}/..\\${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/%2e%2e/${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/.%2E/${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/x/..%2f..%2f${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/x/..%2F..%2F${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/x/..%5c..%5C${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/.\t./${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/.\n./${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/.\r./${OTHER_TENANT}/plan.dxf`,
    `${TENANT_ID}/\t../${OTHER_TENANT}/plan.dxf`,
  ])('rejects dot-segment traversal %j', (path) => {
    expect(isTenantScopedStoragePath(path, TENANT_ID)).toBe(false)
  })

  it.each([
    `${TENANT_ID}/p/plan.dxf?x=1`,
    `${TENANT_ID}/p/plan#frag.dxf`,
    `${TENANT_ID}/p/plan%20a.dxf`,
    `${TENANT_ID}/.. `,
    `${TENANT_ID}/p/plan a.dxf`,
    `${TENANT_ID}/p/plan\u0000.dxf`,
    `${TENANT_ID}/p/plan\u007f.dxf`,
    `${TENANT_ID}//plan.dxf`,
    `${TENANT_ID}/p/`,
  ])('rejects unsafe characters or empty segments %j', (path) => {
    expect(isTenantScopedStoragePath(path, TENANT_ID)).toBe(false)
  })

  it('accepts every first-party writer shape', () => {
    for (const path of [
      `${TENANT_ID}/${PROJECT_ID}/0b6c2f0e-1a2b-4c3d-8e9f-001122334455-Plan_Rev-2.dxf`,
      `${TENANT_ID}/opportunities/${PROJECT_ID}/inspection/abc123-photo.jpg`,
      `${TENANT_ID}/bank-statements/0b6c2f0e-1a2b-4c3d-8e9f-001122334455-stmt.csv`,
      `${TENANT_ID}/${PROJECT_ID}/weekly-report-2026-11-04T00-00-00.html`,
    ]) {
      expect(isTenantScopedStoragePath(path, TENANT_ID)).toBe(true)
    }
  })

  it('allows dots inside a file name', () => {
    expect(isTenantScopedStoragePath(`${TENANT_ID}/p/a..b.dxf`, TENANT_ID)).toBe(true)
  })
})
