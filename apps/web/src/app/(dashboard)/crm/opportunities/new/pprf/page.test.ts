import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { can, type AppRole } from '@third-code-erp/auth'

const ROLES: readonly AppRole[] = [
  'owner', 'estimator', 'pm', 'admin', 'sales', 'commercial', 'design',
  'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx', 'viewer',
]

describe('new PPRF intake route authorization', () => {
  it('requires both canonical capabilities and creates one mounted retry key', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
    expect(source).toContain("can(profile.role, 'pprf.submit')")
    expect(source).toContain("can(profile.role, 'account.create')")
    expect(source).toContain('submissionId={randomUUID()}')
  })

  it.each(ROLES)('projects exact new-intake access for %s', (role) => {
    const allowed = can(role, 'pprf.submit') && can(role, 'account.create')
    expect(allowed).toBe(['owner', 'admin', 'sales'].includes(role))
  })
})
