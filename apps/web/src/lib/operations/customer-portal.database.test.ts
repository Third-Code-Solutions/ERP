import { randomUUID } from 'node:crypto'
import { db } from '@third-code-erp/database'
import { customerPortalSessions, projects, tenants, users, warrantyPortalTokens, warrantyTickets } from '@third-code-erp/database/schema'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
vi.mock('@/lib/operations/notifications', () => ({ notifyExternalEmail: vi.fn(), notifyRoles: vi.fn() }))
vi.mock('@/lib/operations/sla-clock', () => ({ startSlaClock: vi.fn() }))

import { findActiveCustomerSession, hashCustomerPortalToken } from './customer-portal'
import { submitTicket } from '@/app/portal/warranty/[token]/actions'
import * as audit from '@/lib/audit'

const enabled = process.env.PORTAL_DATABASE_EXPECTED === '1'
if (enabled) {
  const target = new URL(process.env.DATABASE_URL ?? '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !(/^\/(?:erp_(?:turnover_audit|self_hosted_ci|readiness)(?:_[a-z0-9]+)*|test_[a-z0-9_]+)$/.test(target.pathname) ||
      (process.env.GITHUB_ACTIONS === 'true' && target.port === '54322' && target.pathname === '/postgres'))) {
    throw new Error('Portal tests require an explicitly enabled loopback disposable database')
  }
}

describe.skipIf(!enabled)('public portal lifecycle against PostgreSQL', () => {
  let tenantId: string
  let actorId: string
  let token: string

  beforeEach(async () => {
    vi.restoreAllMocks()
    tenantId = randomUUID()
    actorId = randomUUID()
    token = randomUUID()
    const projectId = randomUUID()
    await db.insert(tenants).values({ id: tenantId, name: 'Portal integration fixture', slug: `portal-${tenantId}` })
    await db.insert(users).values({ id: actorId, tenant_id: tenantId, full_name: 'Fixture Admin', email: `${actorId}@example.invalid`, role: 'admin' })
    await db.insert(projects).values({ id: projectId, tenant_id: tenantId, name: 'Portal fixture', client: 'Synthetic company' })
    const identity = { tenant_id: tenantId, project_id: projectId, token_hash: hashCustomerPortalToken(token), expires_at: new Date(Date.now() + 60_000) }
    await db.insert(customerPortalSessions).values(identity)
    await db.insert(warrantyPortalTokens).values(identity)
  })

  afterAll(async () => { await db.$client.end({ timeout: 5 }) })

  const form = () => {
    const data = new FormData()
    data.set('submitted_by_name', 'Fixture Customer')
    data.set('submitted_by_email', 'fixture@example.invalid')
    data.set('description', 'Synthetic warranty ticket')
    return data
  }

  async function suspend() {
    await db.update(tenants).set({ status: 'suspended', status_reason: 'Synthetic test suspension', status_changed_at: new Date(), status_changed_by: actorId }).where(eq(tenants.id, tenantId))
  }

  it('suspension denies existing customer and warranty tokens; resume restores valid access', async () => {
    expect(await findActiveCustomerSession(token)).toMatchObject({ tenant_id: tenantId })
    expect(await findActiveCustomerSession(randomUUID())).toBeNull()
    await suspend()
    expect(await findActiveCustomerSession(token)).toBeNull()
    await expect(submitTicket(token, form())).rejects.toThrow('error=expired')
    expect(await db.select().from(warrantyTickets).where(eq(warrantyTickets.tenant_id, tenantId))).toHaveLength(0)
    await db.update(tenants).set({ status: 'active' }).where(eq(tenants.id, tenantId))
    expect(await findActiveCustomerSession(token)).toMatchObject({ tenant_id: tenantId })
    await expect(submitTicket(token, form())).rejects.toThrow('ok=1')
    expect(await db.select().from(warrantyTickets).where(eq(warrantyTickets.tenant_id, tenantId))).toHaveLength(1)
  })

  it('expired and revoked customer links remain denied', async () => {
    await db.update(customerPortalSessions).set({ expires_at: new Date(Date.now() - 1) }).where(eq(customerPortalSessions.tenant_id, tenantId))
    expect(await findActiveCustomerSession(token)).toBeNull()
    await db.update(customerPortalSessions).set({ expires_at: new Date(Date.now() + 60_000), revoked_at: new Date() }).where(eq(customerPortalSessions.tenant_id, tenantId))
    expect(await findActiveCustomerSession(token)).toBeNull()
  })

  it('audit failure rolls back warranty creation', async () => {
    vi.spyOn(audit, 'writeAuditLogInTransaction').mockRejectedValueOnce(new Error('Synthetic audit failure'))
    await expect(submitTicket(token, form())).rejects.toThrow('Synthetic audit failure')
    expect(await db.select().from(warrantyTickets).where(eq(warrantyTickets.tenant_id, tenantId))).toHaveLength(0)
  })

  it('concurrent submissions get distinct sequential ticket numbers', async () => {
    const results = await Promise.allSettled([submitTicket(token, form()), submitTicket(token, form())])
    expect(results.every(result => result.status === 'rejected' && result.reason instanceof Error && result.reason.message.includes('ok=1'))).toBe(true)
    const rows = await db.select({ number: warrantyTickets.ticket_number }).from(warrantyTickets).where(eq(warrantyTickets.tenant_id, tenantId))
    expect(rows.map(row => row.number).sort()).toEqual(['WT-000001', 'WT-000002'])
  })
})
