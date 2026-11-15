import 'reflect-metadata'

import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { PurchaseOrderWorkflowCommand } from '@third-code-erp/shared-types'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import type { AuditService } from '../audit/audit.service'
import type { DatabaseService } from '../database/database.service'
import { PurchaseOrderWorkflowService } from './purchase-order-workflow.service'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'commercial',
  email: 'commercial@example.test',
}

const COMMAND: PurchaseOrderWorkflowCommand = {
  action: 'commercial_approve',
}

function service(
  enabled = false,
  tenantIds: string[] = [],
  notificationsEnabled = false,
  notificationTenantIds: string[] = []
) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'ERP_PO_WORKFLOW_WRITES_ENABLED') return enabled
      if (key === 'ERP_PO_WORKFLOW_WRITES_TENANT_IDS') return tenantIds
      if (key === 'ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED') {
        return notificationsEnabled
      }
      if (key === 'ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS') {
        return notificationTenantIds
      }
      return undefined
    }),
  } as unknown as ConfigService
  return new PurchaseOrderWorkflowService(
    config,
    {} as DatabaseService,
    {} as AuditService
  )
}

describe('PurchaseOrderWorkflowService migration boundary', () => {
  it('fails closed by default without touching the database', async () => {
    await expect(
      service().transition(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'po-workflow-1'
      )
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('stays disabled when no tenant allowlist is present', async () => {
    await expect(
      service(true).transition(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'po-workflow-1'
      )
    ).rejects.toThrow(
      'Purchase Order workflow is not enabled for this tenant; no status change was committed.'
    )
  })

  it('requires notification parity for an explicitly allowed workflow tenant', async () => {
    await expect(
      service(true, [PRINCIPAL.tenantId]).transition(
        '33333333-3333-4333-8333-333333333333',
        COMMAND,
        PRINCIPAL,
        'po-workflow-1'
      )
    ).rejects.toThrow(
      'Purchase Order workflow notifications are not enabled for this tenant; no status change was committed.'
    )
  })
})

const PO_ID = '33333333-3333-4333-8333-333333333333'
const CREATOR_ID = PRINCIPAL.userId
const PM_ID = '44444444-4444-4444-8444-444444444444'
const COMMERCIAL_ID = '55555555-5555-4555-8555-555555555555'

/** Minimal Drizzle transaction fake: selects resolve in call order. */
function workflowService(po: {
  status: string
  createdBy: string | null
  pmApprovedBy: string | null
  projectDeletedAt?: Date | null
  role?: string
}) {
  let requestHash = ''
  const selects: Array<() => unknown[]> = [
    () => [{ tenantId: PRINCIPAL.tenantId, role: po.role ?? 'commercial', email: PRINCIPAL.email }],
    () => [{ id: 'request-1', requestHash, state: 'processing', result: null }],
    () => [
      {
        id: PO_ID,
        status: po.status,
        poNumber: 'PO-0001',
        totalCents: 100,
        vendorId: null,
        createdBy: po.createdBy,
        pmApprovedBy: po.pmApprovedBy,
        projectName: 'Fixture project',
        projectDeletedAt: po.projectDeletedAt ?? null,
      },
    ],
    () => [],
  ]
  const chain = (resolve: () => unknown[]) => {
    const query: Record<string, unknown> = {}
    for (const method of ['from', 'innerJoin', 'where', 'limit', 'for', 'set', 'onConflictDoNothing']) {
      query[method] = () => query
    }
    query.values = (values: { request_hash?: string }) => {
      if (values.request_hash) requestHash = values.request_hash
      return query
    }
    query.returning = () => query
    query.then = (onFulfilled: (rows: unknown[]) => unknown) => Promise.resolve(resolve()).then(onFulfilled)
    return query
  }
  const transaction = {
    select: () => chain(selects.shift() ?? (() => [])),
    insert: () => chain(() => []),
    update: () => chain(() => [{ id: 'updated' }]),
  }
  return new PurchaseOrderWorkflowService(
    {
      get: vi.fn((key: string) =>
        key.endsWith('_TENANT_IDS') ? [PRINCIPAL.tenantId] : true
      ),
    } as unknown as ConfigService,
    {
      client: { transaction: (callback: (tx: unknown) => unknown) => callback(transaction) },
    } as unknown as DatabaseService,
    { stampActor: vi.fn(), writeSemantic: vi.fn() } as unknown as AuditService
  )
}

function as(userId: string): ErpPrincipal {
  return { ...PRINCIPAL, userId }
}

describe('PurchaseOrderWorkflowService separation of duties', () => {
  it('rejects PM approval by the Purchase Order creator', async () => {
    await expect(
      workflowService({ status: 'pending_pm_approval', createdBy: CREATOR_ID, pmApprovedBy: null })
        .transition(PO_ID, { action: 'pm_approve' }, as(CREATOR_ID), 'po-sod-1')
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects Commercial approval by the creator or the PM approver', async () => {
    await expect(
      workflowService({ status: 'pending_commercial_approval', createdBy: CREATOR_ID, pmApprovedBy: PM_ID })
        .transition(PO_ID, COMMAND, as(CREATOR_ID), 'po-sod-2')
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      workflowService({ status: 'pending_commercial_approval', createdBy: CREATOR_ID, pmApprovedBy: PM_ID })
        .transition(PO_ID, COMMAND, as(PM_ID), 'po-sod-3')
    ).rejects.toThrow('Commercial approval must come from someone other than')
  })

  it('refuses every forward step on a PO of a retired project', async () => {
    const retired = new Date('2026-11-01T00:00:00Z')
    for (const [status, action, actor] of [
      ['draft', 'submit_pm_approval', CREATOR_ID],
      ['pending_pm_approval', 'pm_approve', PM_ID],
      ['pending_commercial_approval', 'commercial_approve', COMMERCIAL_ID],
      ['pending_scm_issuance', 'scm_issue', COMMERCIAL_ID],
    ] as const) {
      await expect(
        workflowService({ status, createdBy: CREATOR_ID, pmApprovedBy: PM_ID, projectDeletedAt: retired })
          .transition(PO_ID, { action }, as(actor), `po-retired-${action}`)
      ).rejects.toThrow('The project of this Purchase Order is retired')
    }
  })

  it.each(['pm', 'sd_pm_pe'])(
    'refuses a %s rejecting at SCM issuance (only the issuer or commercial approver may)',
    async (role) => {
      await expect(
        workflowService({ status: 'pending_scm_issuance', createdBy: CREATOR_ID, pmApprovedBy: PM_ID, role })
          .transition(PO_ID, { action: 'reject', reason: 'Not yet' }, as(PM_ID), `po-scm-reject-${role}`)
      ).rejects.toBeInstanceOf(ForbiddenException)
    }
  )

  it.each(['commercial', 'procurement'])('lets a %s reject at SCM issuance', async (role) => {
    await expect(
      workflowService({ status: 'pending_scm_issuance', createdBy: CREATOR_ID, pmApprovedBy: PM_ID, role })
        .transition(PO_ID, { action: 'reject', reason: 'Price changed' }, as(COMMERCIAL_ID), `po-scm-reject-ok-${role}`)
    ).resolves.toMatchObject({ status: 'draft' })
  })

  it('still lets a PO of a retired project be rejected', async () => {
    await expect(
      workflowService({
        status: 'pending_commercial_approval',
        createdBy: CREATOR_ID,
        pmApprovedBy: PM_ID,
        projectDeletedAt: new Date('2026-11-01T00:00:00Z'),
      }).transition(
        PO_ID,
        { action: 'reject', reason: 'Project retired' },
        as(COMMERCIAL_ID),
        'po-retired-reject'
      )
    ).resolves.toMatchObject({ status: 'draft' })
  })

  it('lets three distinct users create, PM-approve and commercially approve', async () => {
    await expect(
      workflowService({ status: 'pending_pm_approval', createdBy: CREATOR_ID, pmApprovedBy: null })
        .transition(PO_ID, { action: 'pm_approve' }, as(PM_ID), 'po-sod-4')
    ).resolves.toMatchObject({ status: 'pending_commercial_approval' })
    await expect(
      workflowService({ status: 'pending_commercial_approval', createdBy: CREATOR_ID, pmApprovedBy: PM_ID })
        .transition(PO_ID, COMMAND, as(COMMERCIAL_ID), 'po-sod-5')
    ).resolves.toMatchObject({ status: 'pending_scm_issuance' })
  })
})
