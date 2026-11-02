import { createHash, randomUUID } from 'node:crypto'
import { db } from '@third-code-erp/database'
import { accounts, auditLog, cnpsSurveys, projects, tenants, users, warrantyTickets } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
vi.mock('@/lib/operations/notifications', () => ({ notifyRoles: vi.fn() }))
import { submitCnpsRating } from './actions'
import * as audit from '@/lib/audit'
import { notifyRoles } from '@/lib/operations/notifications'
import CnpsPortalPage from './page'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

const enabled = process.env.PORTAL_DATABASE_EXPECTED === '1'
if (enabled) {
  const target = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !(/^\/(?:erp_(?:turnover_audit|self_hosted_ci|readiness)(?:_[a-z0-9]+)*|test_[a-z0-9_]+)$/.test(target.pathname) ||
      (process.env.GITHUB_ACTIONS === 'true' && target.port === '54322' && target.pathname === '/postgres'))) {
    throw new Error('CNPS tests require an explicitly enabled loopback disposable database')
  }
}

describe.skipIf(!enabled)('CNPS response integrity against PostgreSQL', () => {
  let tenantId: string
  let actorId: string
  let accountId: string
  let projectId: string
  let token: string
  let surveyId: string

  async function createSurvey() {
    const ticketId = randomUUID()
    const id = randomUUID()
    const plain = randomUUID()
    await db.insert(warrantyTickets).values({ id: ticketId, tenant_id: tenantId, project_id: projectId, account_id: accountId, ticket_number: `WT-${ticketId.slice(0, 8)}`, description: 'Synthetic CNPS fixture' })
    await db.insert(cnpsSurveys).values({ id, tenant_id: tenantId, ticket_id: ticketId, account_id: accountId, response_token_hash: createHash('sha256').update(plain).digest('hex') })
    return { id, token: plain }
  }

  beforeEach(async () => {
    vi.stubGlobal('React', React)
    vi.restoreAllMocks()
    vi.mocked(notifyRoles).mockReset()
    tenantId = randomUUID()
    actorId = randomUUID()
    accountId = randomUUID()
    projectId = randomUUID()
    await db.insert(tenants).values({ id: tenantId, name: 'Synthetic CNPS workspace', legal_name: 'Independent CNPS Builder', slug: `cnps-${tenantId}` })
    await db.insert(users).values({ id: actorId, tenant_id: tenantId, full_name: 'Fixture Admin', email: `${actorId}@example.invalid`, role: 'admin' })
    await db.insert(accounts).values({ id: accountId, tenant_id: tenantId, name: `CNPS account ${accountId}` })
    await db.insert(projects).values({ id: projectId, tenant_id: tenantId, account_id: accountId, name: 'Synthetic CNPS project', client: 'Synthetic customer' })
    const survey = await createSurvey()
    token = survey.token
    surveyId = survey.id
  }, 30_000)

  afterEach(async () => {
    vi.unstubAllGlobals()
    // Keep append-only audit evidence and its tenant/actor; remove only these synthetic business fixtures.
    await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId)))
    await db.delete(accounts).where(and(eq(accounts.id, accountId), eq(accounts.tenant_id, tenantId)))
  }, 30_000)
  afterAll(async () => { await db.$client.end({ timeout: 5 }) })

  function form(score: string) {
    const data = new FormData()
    data.set('score', score)
    data.set('comment', 'Synthetic response')
    return data
  }
  const readSurvey = () => db.select().from(cnpsSurveys).where(eq(cnpsSurveys.id, surveyId))
  const readAccount = () => db.select().from(accounts).where(eq(accounts.id, accountId))
  const readAudit = () => db.select().from(auditLog).where(and(eq(auditLog.tenant_id, tenantId), eq(auditLog.entity_type, 'cnps_survey')))

  it('rejects malformed scores without saving a response', async () => {
    for (const value of ['7junk', '7.5', '1e1', '', '-1', '11']) {
      await expect(submitCnpsRating(token, form(value))).rejects.toThrow('error=invalid')
      expect((await readSurvey())[0]?.responded_at).toBeNull()
    }
    expect(await readAudit()).toHaveLength(0)
  })

  it('rolls back both the response and account total if audit fails', async () => {
    vi.spyOn(audit, 'writeAuditLogInTransaction').mockRejectedValueOnce(new Error('Synthetic audit failure'))
    await expect(submitCnpsRating(token, form('8'))).rejects.toThrow('Synthetic audit failure')
    expect((await readSurvey())[0]).toMatchObject({ responded_at: null, score: null })
    expect((await readAccount())[0]?.cnps_score_x10).toBeNull()
    expect(await readAudit()).toHaveLength(0)
  })

  it('denies suspended companies and unknown tokens on read and write', async () => {
    await db.update(tenants).set({ status: 'suspended', status_reason: 'Synthetic suspension', status_changed_at: new Date(), status_changed_by: actorId }).where(eq(tenants.id, tenantId))
    await expect(submitCnpsRating(token, form('8'))).rejects.toThrow('error=unavailable')
    await expect(submitCnpsRating(randomUUID(), form('8'))).rejects.toThrow('error=unavailable')
    const markup = renderToStaticMarkup(await CnpsPortalPage({ params: Promise.resolve({ token }), searchParams: Promise.resolve({ ok: '1' }) }))
    expect(markup).toContain('Link not recognised')
    expect((await readSurvey())[0]?.responded_at).toBeNull()
  })

  it('saves and audits only one simultaneous response; retries cannot overwrite it', async () => {
    const results = await Promise.allSettled([submitCnpsRating(token, form('8')), submitCnpsRating(token, form('10'))])
    expect(results.every(result => result.status === 'rejected' && result.reason instanceof Error && result.reason.message === `REDIRECT:/portal/cnps/${token}`)).toBe(true)
    const saved = (await readSurvey())[0]!
    expect([8, 10]).toContain(saved.score)
    expect(saved.responded_at).not.toBeNull()
    await expect(submitCnpsRating(token, form('2'))).rejects.toThrow(`REDIRECT:/portal/cnps/${token}`)
    expect((await readSurvey())[0]?.score).toBe(saved.score)
    expect((await readAccount())[0]?.cnps_score_x10).toBe((saved.score! * 10).toFixed(1))
    expect(await readAudit()).toHaveLength(1)
    expect(notifyRoles).not.toHaveBeenCalled()
  })

  it('serializes concurrent surveys on one account', async () => {
    const second = await createSurvey()
    const results = await Promise.allSettled([submitCnpsRating(token, form('8')), submitCnpsRating(second.token, form('10'))])
    expect(results.every(result => result.status === 'rejected' && result.reason instanceof Error && result.reason.message.startsWith('REDIRECT:'))).toBe(true)
    expect((await readAccount())[0]?.cnps_score_x10).toBe('90.0')
    expect(await readAudit()).toHaveLength(2)
  })

  it('ignores caller-supplied tenant/account identity and preserves another company', async () => {
    const otherTenantId = randomUUID()
    const otherAccountId = randomUUID()
    await db.insert(tenants).values({ id: otherTenantId, name: 'Unrelated CNPS company', slug: `cnps-${otherTenantId}` })
    await db.insert(accounts).values({ id: otherAccountId, tenant_id: otherTenantId, name: 'Unrelated CNPS account', cnps_score_x10: '20.0' })
    try {
      const data = form('8')
      data.set('tenant_id', otherTenantId)
      data.set('account_id', otherAccountId)
      await expect(submitCnpsRating(token, data)).rejects.toThrow(`REDIRECT:/portal/cnps/${token}`)
      expect((await readAccount())[0]?.cnps_score_x10).toBe('80.0')
      expect((await db.select().from(accounts).where(eq(accounts.id, otherAccountId)))[0]?.cnps_score_x10).toBe('20.0')
      expect(await readAudit()).toHaveLength(1)
      expect(await db.select().from(auditLog).where(and(eq(auditLog.tenant_id, otherTenantId), eq(auditLog.entity_type, 'cnps_survey')))).toHaveLength(0)
    } finally {
      await db.delete(accounts).where(and(eq(accounts.id, otherAccountId), eq(accounts.tenant_id, otherTenantId)))
    }
  })

  it('keeps a committed response successful when CX notification fails', async () => {
    vi.mocked(notifyRoles).mockRejectedValueOnce(new Error('Synthetic notification failure'))
    await expect(submitCnpsRating(token, form('3'))).rejects.toThrow(`REDIRECT:/portal/cnps/${token}`)
    expect((await readSurvey())[0]?.score).toBe(3)
    expect(await readAudit()).toHaveLength(1)
  })
})
