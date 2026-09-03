import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { can, type AppRole } from '@third-code-erp/auth'

const ROLES: readonly AppRole[] = [
  'owner', 'estimator', 'pm', 'admin', 'sales', 'commercial', 'design',
  'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx', 'viewer',
]

describe('PPRF detail route authorization projection', () => {
  it('keeps reads mounted for every role and gates only the submission form via central can', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
    expect(source).toContain("const canSubmit = can(profile.role, 'pprf.submit')")
    expect(source).toContain('{submissionId ? (')
    expect(source).toContain('You can review prior PPRF versions')
    expect(source).not.toContain("redirect('/crm/accounts?error=forbidden')")
    expect(source).toContain('const submissionId = canSubmit ? randomUUID() : null')
    expect(source).toContain('key={submissionId}')
  })

  it.each(ROLES)('projects exact detail submission visibility for %s', (role) => {
    expect(can(role, 'pprf.submit')).toBe(['owner', 'admin', 'sales'].includes(role))
  })
})
