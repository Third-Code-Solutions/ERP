import { describe, expect, it } from 'vitest'

import { ERP_ROLES, type ErpRole } from '@third-code-erp/shared-types'

import {
  SiteInspectionWorkflowService,
  siteInspectionPayloadSchema,
  siteInspectionReceiptSchema,
  siteInspectionRfiCommandSchema,
  siteInspectionRfiReceiptSchema,
  siteInspectionSubmissionCommandSchema,
  siteInspectionWorkflowResultSchema,
  type SiteInspectionRfiCommand,
  type SiteInspectionSubmissionCommand,
  type SiteInspectionWorkflowStore,
  type SiteInspectionWorkflowTransaction,
} from './site-inspection-workflow-service'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const OPPORTUNITY_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const INSPECTION_ID = '55555555-5555-4555-8555-555555555555'
const RFI_ID = '66666666-6666-4666-8666-666666666666'
const SUBMISSION_ID = '77777777-7777-4777-8777-777777777777'
const RFI_SUBMISSION_ID = '88888888-8888-4888-8888-888888888888'
const PHOTO_1 = '99999999-9999-4999-8999-999999999991'
const PHOTO_2 = '99999999-9999-4999-8999-999999999992'
const DESIGN_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const DESIGN_2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const OTHER_TENANT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const OTHER_USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = new Date('2026-09-03T03:04:05.000Z')

const payload = {
  siteAddress: 'Makati City',
  floorAreaSqm: '120.50',
  landlordContact: 'Facilities desk',
  asBuiltAvailable: 'partial' as const,
  expectedStartDate: '2026-10-01',
  weather: 'Fair',
  accessibilityNotes: 'Freight elevator available',
  observations: 'Existing ceiling to verify',
}

const inspectionCommand: SiteInspectionSubmissionCommand = {
  kind: 'inspection_submission',
  submissionId: SUBMISSION_ID,
  opportunityId: OPPORTUNITY_ID,
  payload,
  photoDocumentIds: [PHOTO_2, PHOTO_1],
}

const rfiCommand: SiteInspectionRfiCommand = {
  kind: 'rfi_creation',
  submissionId: RFI_SUBMISSION_ID,
  opportunityId: OPPORTUNITY_ID,
  inspectionId: INSPECTION_ID,
  description: 'Confirm existing ceiling load capacity',
  priority: 'major',
}

type Audit = Parameters<SiteInspectionWorkflowTransaction['writeAudit']>[0]
type Notification = Parameters<
  SiteInspectionWorkflowTransaction['createNotification']
>[0]
type FailAt =
  | 'inspection'
  | 'photos'
  | 'inspection_audit'
  | 'sla_read'
  | 'sla'
  | 'recipient_query'
  | 'notification_1'
  | 'notification_2'
  | 'inspection_result'
  | 'rfi'
  | 'rfi_audit'
  | 'rfi_result'

type State = {
  memberships: Array<{ tenantId: string; userId: string; role: ErpRole }>
  opportunities: Array<{ tenantId: string; id: string; projectId: string | null }>
  pprfs: Array<{ tenantId: string; opportunityId: string }>
  documents: Array<{
    tenantId: string
    id: string
    opportunityId: string | null
    projectId: string | null
  }>
  inspections: Array<{
    tenantId: string
    id: string
    opportunityId: string
    submissionId: string
    status: string
    submittedAt: Date
    payload: Record<string, string>
  }>
  photos: Array<{ tenantId: string; inspectionId: string; documentId: string }>
  rfis: Array<{
    tenantId: string
    id: string
    inspectionId: string
    description: string
    priority: 'minor' | 'major'
    createdAt: Date
  }>
  audits: Audit[]
  slas: Array<{ tenantId: string; opportunityId: string }>
  recipients: Array<{ tenantId: string; id: string; email: string; role: ErpRole }>
  notifications: Notification[]
}

function createHarness(options: {
  role?: ErpRole
  membership?: boolean
  failAt?: FailAt
  pprf?: boolean
  opportunity?: boolean
  inspection?: boolean
  recipients?: State['recipients']
  documents?: State['documents']
  now?: () => Date
} = {}) {
  let state: State = {
    memberships: options.membership === false ? [] : [
      { tenantId: TENANT_ID, userId: USER_ID, role: options.role ?? 'commercial' },
    ],
    opportunities: options.opportunity === false ? [] : [
      { tenantId: TENANT_ID, id: OPPORTUNITY_ID, projectId: PROJECT_ID },
    ],
    pprfs: options.pprf === false ? [] : [
      { tenantId: TENANT_ID, opportunityId: OPPORTUNITY_ID },
    ],
    documents: options.documents ?? [
      { tenantId: TENANT_ID, id: PHOTO_1, opportunityId: OPPORTUNITY_ID, projectId: null },
      { tenantId: TENANT_ID, id: PHOTO_2, opportunityId: null, projectId: PROJECT_ID },
    ],
    inspections: options.inspection === false ? [] : [
      {
        tenantId: TENANT_ID,
        id: INSPECTION_ID,
        opportunityId: OPPORTUNITY_ID,
        submissionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        status: 'submitted',
        submittedAt: NOW,
        payload: {},
      },
    ],
    photos: [],
    rfis: [],
    audits: [],
    slas: [],
    recipients: options.recipients ?? [
      { tenantId: TENANT_ID, id: DESIGN_1, email: 'design1@example.test', role: 'design' },
      { tenantId: TENANT_ID, id: DESIGN_2, email: 'design2@example.test', role: 'design' },
    ],
    notifications: [],
  }
  let transactionTail = Promise.resolve()
  const locks: string[] = []

  const store: SiteInspectionWorkflowStore = {
    transaction: <T>(callback: (tx: SiteInspectionWorkflowTransaction) => Promise<T>) => {
      const run = async (): Promise<T> => {
        const working = structuredClone(state)
        let notificationNumber = 0
        const tx: SiteInspectionWorkflowTransaction = {
          lockMembership: async (actor) => {
            const member = working.memberships.find(
              (row) => row.tenantId === actor.tenantId && row.userId === actor.userId
            )
            return member ? { tenantId: member.tenantId, role: member.role } : null
          },
          lockCommand: async (tenantId, keyHash) => {
            locks.push(`${tenantId}:${keyHash}`)
          },
          lockOpportunity: async (tenantId, id) =>
            working.opportunities.find((row) => row.tenantId === tenantId && row.id === id) ?? null,
          hasPprf: async (tenantId, id) =>
            working.pprfs.some((row) => row.tenantId === tenantId && row.opportunityId === id),
          findInspectionBySubmission: async (tenantId, submissionId) => {
            const row = working.inspections.find(
              (item) => item.tenantId === tenantId && item.submissionId === submissionId
            )
            return row ? { id: row.id, opportunityId: row.opportunityId } : null
          },
          findReceipts: async (tenantId, kind, keyHash) =>
            working.audits
              .filter((audit) =>
                audit.tenantId === tenantId &&
                audit.diff.submission_kind === kind &&
                audit.diff.idempotency_key_hash === keyHash
              )
              .map((audit) => ({ entityId: audit.entityId, diff: audit.diff })),
          loadInspection: async (tenantId, id) => {
            const row = working.inspections.find(
              (item) => item.tenantId === tenantId && item.id === id
            )
            return row ? {
              id: row.id,
              tenantId: row.tenantId,
              opportunityId: row.opportunityId,
              status: row.status,
              submittedAt: row.submittedAt,
            } : null
          },
          lockInspection: async (tenantId, id) => {
            const row = working.inspections.find(
              (item) => item.tenantId === tenantId && item.id === id
            )
            return row ? {
              id: row.id,
              tenantId: row.tenantId,
              opportunityId: row.opportunityId,
            } : null
          },
          loadRfi: async (tenantId, id) => {
            const row = working.rfis.find((item) => item.tenantId === tenantId && item.id === id)
            return row ? {
              id: row.id,
              tenantId: row.tenantId,
              inspectionId: row.inspectionId,
              priority: row.priority,
              createdAt: row.createdAt,
            } : null
          },
          loadPhotoDocuments: async (tenantId, ids) =>
            working.documents.filter(
              (row) => row.tenantId === tenantId && ids.includes(row.id)
            ),
          countInspectionPhotos: async (tenantId, id) =>
            working.photos.filter((row) => row.tenantId === tenantId && row.inspectionId === id).length,
          hasOpenDesignHandoffSla: async (tenantId, id) => {
            if (options.failAt === 'sla_read') throw new Error('SLA read failed')
            return working.slas.some(
              (row) => row.tenantId === tenantId && row.opportunityId === id
            )
          },
          findDesignRecipients: async (tenantId) => {
            if (options.failAt === 'recipient_query') throw new Error('recipient query failed')
            return working.recipients
              .filter((row) => row.tenantId === tenantId)
              .map(({ id, email, role }) => ({ id, email, role }))
          },
          findNotifiedDesignRecipientIds: async (tenantId, id, inspectionId) =>
            working.notifications
              .filter((row) => row.tenantId === tenantId &&
                row.linkUrl === `/crm/opportunities/${id}/proposal/inspection` &&
                row.inspectionId === inspectionId)
              .map((row) => row.recipientUserId),
          createInspection: async (input) => {
            if (options.failAt === 'inspection') throw new Error('inspection failed')
            const id = options.failAt === 'inspection_result' ? 'invalid' : INSPECTION_ID
            working.inspections.push({
              tenantId: input.tenantId,
              id,
              opportunityId: input.opportunityId,
              submissionId: input.submissionId,
              status: 'submitted',
              submittedAt: input.submittedAt,
              payload: input.payload,
            })
            return { id }
          },
          createPhotoLinks: async (rows) => {
            if (options.failAt === 'photos') throw new Error('photos failed')
            working.photos.push(...rows)
          },
          writeAudit: async (input) => {
            const expectedFailure = input.entityType === 'site_inspection'
              ? 'inspection_audit'
              : 'rfi_audit'
            if (options.failAt === expectedFailure) throw new Error('audit failed')
            working.audits.push(input)
          },
          ensureDesignHandoffSla: async (tenantId, id) => {
            if (options.failAt === 'sla_read') throw new Error('SLA read failed')
            if (options.failAt === 'sla') throw new Error('SLA failed')
            if (!working.slas.some((row) => row.tenantId === tenantId && row.opportunityId === id)) {
              working.slas.push({ tenantId, opportunityId: id })
            }
          },
          createNotification: async (input) => {
            notificationNumber += 1
            if (options.failAt === `notification_${notificationNumber}`) {
              throw new Error('notification failed')
            }
            working.notifications.push(input)
          },
          createRfi: async (input) => {
            if (options.failAt === 'rfi') throw new Error('RFI failed')
            const id = options.failAt === 'rfi_result' ? 'invalid' : RFI_ID
            working.rfis.push({ ...input, id })
            return { id }
          },
        }
        const result = await callback(tx)
        state = working
        return result
      }
      const result = transactionTail.then(run, run)
      transactionTail = result.then(() => undefined, () => undefined)
      return result
    },
  }

  return {
    service: new SiteInspectionWorkflowService(store, options.now ?? (() => NOW)),
    state: () => state,
    locks,
    seedMembership(member: State['memberships'][number]) { state.memberships.push(member) },
    seedOpportunity(row: State['opportunities'][number]) { state.opportunities.push(row) },
  }
}

function principal(tenantId = TENANT_ID, userId = USER_ID) {
  return { tenantId, userId }
}

const allowedRoles = new Set<ErpRole>(['owner', 'admin', 'commercial'])

describe('strict commands and receipts', () => {
  it('normalizes text and validates real calendar dates', () => {
    expect(siteInspectionPayloadSchema.parse({
      ...payload,
      siteAddress: '  Makati City  ',
      expectedStartDate: '2028-02-29',
    }).siteAddress).toBe('Makati City')
    expect(siteInspectionPayloadSchema.safeParse({
      ...payload,
      expectedStartDate: '2026-02-29',
    }).success).toBe(false)
  })

  it.each([
    [{ ...inspectionCommand, extra: true }, siteInspectionSubmissionCommandSchema],
    [{ ...rfiCommand, extra: true }, siteInspectionRfiCommandSchema],
    [{ ...rfiCommand, description: ' ' }, siteInspectionRfiCommandSchema],
    [{ ...rfiCommand, priority: 'urgent' }, siteInspectionRfiCommandSchema],
    [{ ...inspectionCommand, photoDocumentIds: [PHOTO_1, PHOTO_1] }, siteInspectionSubmissionCommandSchema],
    [{ ...inspectionCommand, photoDocumentIds: Array(11).fill(PHOTO_1) }, siteInspectionSubmissionCommandSchema],
  ])('rejects hostile or unbounded command %#', (value, schema) => {
    expect(schema.safeParse(value).success).toBe(false)
  })

  it('keeps receipt and result schemas strict', () => {
    expect(siteInspectionReceiptSchema.safeParse({ extra: true }).success).toBe(false)
    expect(siteInspectionRfiReceiptSchema.safeParse({ extra: true }).success).toBe(false)
    expect(siteInspectionWorkflowResultSchema.safeParse({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'failed', extra: true },
    }).success).toBe(false)
  })
})

describe('authorization and target isolation', () => {
  it.each(ERP_ROLES)('enforces exact inspection role policy for %s', async (role) => {
    const harness = createHarness({ role, inspection: false })
    const result = await harness.service.submitInspection(principal(), inspectionCommand)
    expect(result.ok).toBe(allowedRoles.has(role))
    expect(harness.state().inspections).toHaveLength(allowedRoles.has(role) ? 1 : 0)
  })

  it.each(ERP_ROLES)('enforces exact RFI role policy for %s', async (role) => {
    const harness = createHarness({ role })
    const result = await harness.service.createRfi(principal(), rfiCommand)
    expect(result.ok).toBe(allowedRoles.has(role))
    expect(harness.state().rfis).toHaveLength(allowedRoles.has(role) ? 1 : 0)
  })

  it('denies missing/wrong membership and stale role input before effects', async () => {
    const missing = createHarness({ membership: false, inspection: false })
    expect(await missing.service.submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'FORBIDDEN' },
    })
    const wrong = createHarness({ inspection: false })
    expect(await wrong.service.submitInspection(principal(OTHER_TENANT), inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'FORBIDDEN' },
    })
    const stale = createHarness({ role: 'viewer', inspection: false })
    const stalePrincipal = { ...principal(), role: 'owner' }
    expect(await stale.service.submitInspection(stalePrincipal, inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'VALIDATION_ERROR' },
    })
  })

  it('fails closed for missing Opportunity, PPRF, or inspection', async () => {
    expect(await createHarness({ opportunity: false, inspection: false }).service
      .submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'NOT_FOUND' },
    })
    expect(await createHarness({ pprf: false, inspection: false }).service
      .submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'PPRF_REQUIRED' },
    })
    expect(await createHarness({ inspection: false }).service
      .createRfi(principal(), rfiCommand)).toMatchObject({
      ok: false, error: { code: 'NOT_FOUND' },
    })
  })
})

describe('atomic inspection submission', () => {
  it('commits exact inspection/photo/audit/SLA/Design durable effects', async () => {
    const harness = createHarness({ inspection: false })
    expect(await harness.service.submitInspection(principal(), inspectionCommand)).toEqual({
      ok: true,
      kind: 'inspection_submission',
      tenantId: TENANT_ID,
      actorId: USER_ID,
      opportunityId: OPPORTUNITY_ID,
      inspectionId: INSPECTION_ID,
      status: 'submitted',
      submittedAt: NOW.toISOString(),
      linkedPhotoCount: 2,
      replayed: false,
    })
    expect(harness.state().photos.map((row) => row.documentId).sort()).toEqual([PHOTO_1, PHOTO_2])
    expect(harness.state().audits).toHaveLength(1)
    expect(harness.state().slas).toHaveLength(1)
    expect(harness.state().notifications.map((row) => row.recipientUserId)).toEqual([DESIGN_1, DESIGN_2])
  })

  it('rejects missing, foreign-tenant, foreign-Opportunity, or foreign-Project photos atomically', async () => {
    for (const documents of [
      [{ tenantId: TENANT_ID, id: PHOTO_1, opportunityId: OPPORTUNITY_ID, projectId: null }],
      [
        { tenantId: TENANT_ID, id: PHOTO_1, opportunityId: OPPORTUNITY_ID, projectId: null },
        { tenantId: OTHER_TENANT, id: PHOTO_2, opportunityId: OPPORTUNITY_ID, projectId: null },
      ],
      [
        { tenantId: TENANT_ID, id: PHOTO_1, opportunityId: OPPORTUNITY_ID, projectId: null },
        { tenantId: TENANT_ID, id: PHOTO_2, opportunityId: PROJECT_ID, projectId: null },
      ],
      [
        { tenantId: TENANT_ID, id: PHOTO_1, opportunityId: OPPORTUNITY_ID, projectId: null },
        { tenantId: TENANT_ID, id: PHOTO_2, opportunityId: null, projectId: USER_ID },
      ],
    ]) {
      const harness = createHarness({ inspection: false, documents })
      expect(await harness.service.submitInspection(principal(), inspectionCommand)).toMatchObject({
        ok: false, error: { code: 'NOT_FOUND' },
      })
      expect(harness.state().inspections).toHaveLength(0)
    }
  })

  it.each([
    'inspection', 'photos', 'inspection_audit', 'sla_read', 'sla',
    'recipient_query', 'notification_1', 'notification_2', 'inspection_result',
  ] satisfies FailAt[])('rolls back every inspection effect when %s fails', async (failAt) => {
    const harness = createHarness({ inspection: false, failAt })
    expect(await harness.service.submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'INTERNAL_ERROR' },
    })
    expect(harness.state().inspections).toHaveLength(0)
    expect(harness.state().photos).toHaveLength(0)
    expect(harness.state().audits).toHaveLength(0)
    expect(harness.state().slas).toHaveLength(0)
    expect(harness.state().notifications).toHaveLength(0)
  })

  it('preserves one open SLA, allows zero Design recipients, and de-duplicates recipients', async () => {
    const existingSla = createHarness({ inspection: false })
    existingSla.state().slas.push({ tenantId: TENANT_ID, opportunityId: OPPORTUNITY_ID })
    expect((await existingSla.service.submitInspection(principal(), inspectionCommand)).ok).toBe(true)
    expect(existingSla.state().slas).toHaveLength(1)

    const none = createHarness({ inspection: false, recipients: [] })
    expect((await none.service.submitInspection(principal(), inspectionCommand)).ok).toBe(true)
    expect(none.state().notifications).toHaveLength(0)

    const duplicate = createHarness({ inspection: false, recipients: [
      { tenantId: TENANT_ID, id: DESIGN_1, email: 'design@example.test', role: 'design' },
      { tenantId: TENANT_ID, id: DESIGN_1, email: 'design@example.test', role: 'design' },
    ] })
    expect((await duplicate.service.submitInspection(principal(), inspectionCommand)).ok).toBe(true)
    expect(duplicate.state().notifications).toHaveLength(1)
  })
})

describe('inspection replay, conflict, and concurrency', () => {
  it('replays without duplicate effects and conflicts on changed payload/photo set', async () => {
    const harness = createHarness({ inspection: false })
    expect(await harness.service.submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: true, replayed: false,
    })
    expect(await harness.service.submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: true, replayed: true,
    })
    for (const changed of [
      { ...inspectionCommand, payload: { ...payload, observations: 'changed' } },
      { ...inspectionCommand, photoDocumentIds: [PHOTO_1] },
    ]) {
      expect(await harness.service.submitInspection(principal(), changed)).toMatchObject({
        ok: false, error: { code: 'CONFLICT' },
      })
    }
    expect(harness.state().inspections).toHaveLength(1)
    expect(harness.state().audits).toHaveLength(1)
  })

  it('rejects malformed receipts and incomplete durable result', async () => {
    const malformed = createHarness({ inspection: false })
    await malformed.service.submitInspection(principal(), inspectionCommand)
    malformed.state().audits[0]!.diff = { malformed: true }
    expect(await malformed.service.submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'CONFLICT' },
    })

    const incomplete = createHarness({ inspection: false })
    await incomplete.service.submitInspection(principal(), inspectionCommand)
    incomplete.state().slas.length = 0
    expect(await incomplete.service.submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'CONFLICT' },
    })

    const missingNotification = createHarness({ inspection: false })
    await missingNotification.service.submitInspection(principal(), inspectionCommand)
    missingNotification.state().notifications.pop()
    expect(await missingNotification.service.submitInspection(principal(), inspectionCommand)).toMatchObject({
      ok: false, error: { code: 'CONFLICT' },
    })
  })

  it('serializes concurrent retries into one effect set', async () => {
    const harness = createHarness({ inspection: false })
    const results = await Promise.all([
      harness.service.submitInspection(principal(), inspectionCommand),
      harness.service.submitInspection(principal(), inspectionCommand),
    ])
    expect(results.map((result) => result.ok && result.replayed).sort()).toEqual([false, true])
    expect(harness.state().inspections).toHaveLength(1)
  })

  it('scopes same key per tenant and hashes the complete UUID', async () => {
    const harness = createHarness({ inspection: false })
    harness.seedMembership({ tenantId: OTHER_TENANT, userId: OTHER_USER, role: 'commercial' })
    harness.seedOpportunity({ tenantId: OTHER_TENANT, id: OPPORTUNITY_ID, projectId: null })
    harness.state().pprfs.push({ tenantId: OTHER_TENANT, opportunityId: OPPORTUNITY_ID })
    const noPhotos = { ...inspectionCommand, photoDocumentIds: [] }
    await harness.service.submitInspection(principal(), noPhotos)
    await harness.service.submitInspection(principal(OTHER_TENANT, OTHER_USER), noPhotos)
    await harness.service.submitInspection(principal(), {
      ...noPhotos,
      submissionId: '77777777-7777-4777-8777-777777777778',
    })
    expect(harness.state().inspections).toHaveLength(3)
    expect(new Set(harness.locks.map((lock) => lock.split(':').at(-1))).size).toBe(3)
  })
})

describe('atomic RFI creation', () => {
  it('commits one RFI and one semantic receipt', async () => {
    const harness = createHarness()
    expect(await harness.service.createRfi(principal(), rfiCommand)).toEqual({
      ok: true,
      kind: 'rfi_creation',
      tenantId: TENANT_ID,
      actorId: USER_ID,
      opportunityId: OPPORTUNITY_ID,
      inspectionId: INSPECTION_ID,
      rfiId: RFI_ID,
      priority: 'major',
      createdAt: NOW.toISOString(),
      replayed: false,
    })
    expect(harness.state().rfis).toHaveLength(1)
    expect(harness.state().audits).toHaveLength(1)
  })

  it.each(['rfi', 'rfi_audit', 'rfi_result'] satisfies FailAt[])(
    'rolls back RFI and audit when %s fails', async (failAt) => {
      const harness = createHarness({ failAt })
      expect(await harness.service.createRfi(principal(), rfiCommand)).toMatchObject({
        ok: false, error: { code: 'INTERNAL_ERROR' },
      })
      expect(harness.state().rfis).toHaveLength(0)
      expect(harness.state().audits).toHaveLength(0)
    }
  )

  it('replays exactly and conflicts on changed description or priority', async () => {
    const harness = createHarness()
    expect(await harness.service.createRfi(principal(), rfiCommand)).toMatchObject({
      ok: true, replayed: false,
    })
    expect(await harness.service.createRfi(principal(), rfiCommand)).toMatchObject({
      ok: true, replayed: true,
    })
    for (const changed of [
      { ...rfiCommand, description: 'Changed description' },
      { ...rfiCommand, priority: 'minor' as const },
    ]) {
      expect(await harness.service.createRfi(principal(), changed)).toMatchObject({
        ok: false, error: { code: 'CONFLICT' },
      })
    }
    expect(harness.state().rfis).toHaveLength(1)
  })

  it('rejects malformed receipt or missing durable row', async () => {
    const malformed = createHarness()
    await malformed.service.createRfi(principal(), rfiCommand)
    malformed.state().audits[0]!.diff.command_hash = 'malformed'
    expect(await malformed.service.createRfi(principal(), rfiCommand)).toMatchObject({
      ok: false, error: { code: 'CONFLICT' },
    })
    const missing = createHarness()
    await missing.service.createRfi(principal(), rfiCommand)
    missing.state().rfis.length = 0
    expect(await missing.service.createRfi(principal(), rfiCommand)).toMatchObject({
      ok: false, error: { code: 'CONFLICT' },
    })
  })

  it('serializes concurrent same-key calls', async () => {
    const harness = createHarness()
    const results = await Promise.all([
      harness.service.createRfi(principal(), rfiCommand),
      harness.service.createRfi(principal(), rfiCommand),
    ])
    expect(results.map((result) => result.ok && result.replayed).sort()).toEqual([false, true])
    expect(harness.state().rfis).toHaveLength(1)
    expect(harness.state().audits).toHaveLength(1)
  })
})

describe('receipt privacy', () => {
  it('stores only hashes and durable IDs, never raw keys/free text/photo IDs', async () => {
    const inspection = createHarness({ inspection: false })
    await inspection.service.submitInspection(principal(), inspectionCommand)
    const inspectionReceipt = JSON.stringify(inspection.state().audits[0]!.diff)
    expect(inspectionReceipt).not.toContain(SUBMISSION_ID)
    expect(inspectionReceipt).not.toContain(payload.observations)
    expect(inspectionReceipt).not.toContain(PHOTO_1)

    const rfi = createHarness()
    await rfi.service.createRfi(principal(), rfiCommand)
    const rfiReceipt = JSON.stringify(rfi.state().audits[0]!.diff)
    expect(rfiReceipt).not.toContain(RFI_SUBMISSION_ID)
    expect(rfiReceipt).not.toContain(rfiCommand.description)
    expect(rfiReceipt).toMatch(/"idempotency_key_hash":"[a-f0-9]{64}"/)
    expect(rfiReceipt).toMatch(/"command_hash":"[a-f0-9]{64}"/)
  })
})
