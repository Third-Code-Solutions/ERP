import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { can, type AppRole } from '@third-code-erp/auth'

const ROLES: readonly AppRole[] = [
  'owner', 'estimator', 'pm', 'admin', 'sales', 'commercial', 'design',
  'sd_pm_pe', 'finance', 'procurement', 'safety', 'cx', 'viewer',
]

describe('site inspection mounted authorization projection', () => {
  it.each(ROLES)('projects exact mutation controls for %s', (role) => {
    expect(can(role, 'site_inspection.submit')).toBe(
      ['owner', 'admin', 'commercial'].includes(role),
    )
  })

  it('keeps history readable while gating both forms with central can', () => {
    const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')
    expect(source).toContain("const canSubmit = can(profile.role, 'site_inspection.submit')")
    expect(source).toContain('{canSubmit ? (')
    expect(source).toContain('You can review inspection history')
    expect(source).toContain('submissionId={rfiSubmissionId}')
    expect(source).not.toContain("redirect('/crm/accounts?error=forbidden')")
  })
})
