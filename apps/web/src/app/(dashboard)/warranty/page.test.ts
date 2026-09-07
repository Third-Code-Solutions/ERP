import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

describe('warranty queue portal access', () => {
  it('links every ticket row to its detail route', () => {
    expect(source).toContain('href={`/warranty/${r.id}`}')
    expect(source).toContain('aria-label={`Open warranty ticket ${r.ticket_number}`}')
  })

  it('loads tenant projects and mounts portal issuance only for warranty managers', () => {
    expect(source).toContain("const canManage = can(profile.role, 'warranty.manage')")
    expect(source).toContain('.where(eq(projects.tenant_id, profile.tenantId))')
    expect(source).toContain('{canManage && (')
    expect(source).toContain('<WarrantyPortalLinkIssuer projects={portalProjects} />')
  })
})
