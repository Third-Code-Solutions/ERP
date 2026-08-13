import { createSlaClockSchedule, philippineBusinessDays } from '@third-code-erp/shared-types'
import { db, type Database } from '@third-code-erp/database'
import {
  awardHandoffs,
  boms,
  bomLineItems,
  costCodes,
  invoices,
  masterSchedules,
  opportunities,
  processSteps,
  projectBudgetLines,
  projectBudgets,
  projects,
  slaClocks,
  taskInstances,
  users,
  boqDivisions,
} from '@third-code-erp/database/schema'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { resolveTenantBusinessDayService } from './business-calendar'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type AwardTaskKey = 'arProjectCode' | 'downPaymentInvoice' | 'cari' | 'projectTracker' | 'cxOnboarding'

type AwardTaskResult = Record<AwardTaskKey, string>

export interface AwardAutomationResult {
  handoffId: string
  projectId: string
  projectCode: string
  budgetId: string
  dpInvoiceId: string
  projectTrackerId: string
  taskIds: AwardTaskResult
  reused: boolean
}

export interface SignedBomAwardArgs {
  tenantId: string
  bomId: string
  actorId: string | null
  downPaymentBps?: number
  now?: Date
}

const AWARD_PROCESS_STEP_SPECS: ReadonlyArray<{
  key: AwardTaskKey
  code: string
  name: string
  responsibleBu: string
  input: string
  inputFrom: string
  output: string
  outputBy: string
  slaDays: number
  blockedUntilNtp: boolean
}> = [
  {
    key: 'arProjectCode',
    code: 'AWARD.AR_PROJECT_CODE',
    name: 'AR / project code request',
    responsibleBu: 'Finance',
    input: 'Signed BOM and promoted project',
    inputFrom: 'Commercial',
    output: 'AR and project code request',
    outputBy: 'Finance',
    slaDays: 2,
    blockedUntilNtp: false,
  },
  {
    key: 'downPaymentInvoice',
    code: 'AWARD.DP_INVOICE',
    name: 'Down-payment invoice draft',
    responsibleBu: 'Finance',
    input: 'Signed BOM and project code',
    inputFrom: 'Finance',
    output: 'Draft down-payment invoice',
    outputBy: 'Finance',
    slaDays: 2,
    blockedUntilNtp: false,
  },
  {
    key: 'cari',
    code: 'AWARD.CARI',
    name: 'CARI task',
    responsibleBu: 'Finance',
    input: 'Signed BOM and contract file',
    inputFrom: 'Finance',
    output: 'CARI task',
    outputBy: 'Finance',
    slaDays: 5,
    blockedUntilNtp: false,
  },
  {
    key: 'projectTracker',
    code: 'AWARD.PROJECT_TRACKER',
    name: 'Project Tracker setup',
    responsibleBu: 'SD/PM/PE',
    input: 'Signed BOM and NTP date',
    inputFrom: 'PM',
    output: 'Project Tracker',
    outputBy: 'SD/PM/PE',
    slaDays: 2,
    blockedUntilNtp: true,
  },
  {
    key: 'cxOnboarding',
    code: 'AWARD.CX_ONBOARDING',
    name: 'CX onboarding task',
    responsibleBu: 'CX',
    input: 'Signed BOM and NTP date',
    inputFrom: 'SD/PM/PE',
    output: 'CX onboarding task',
    outputBy: 'CX',
    slaDays: 2,
    blockedUntilNtp: true,
  },
]

function manilaDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function manilaYear(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
  }).format(value)
}

function normalizeCode(value: string | null): string {
  const normalized = (value ?? 'GEN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.slice(0, 18) || 'GEN'
}

function assertValidDate(value: Date): void {
  if (Number.isNaN(value.getTime())) throw new Error('Award automation requires a valid timestamp')
}

function assertDownPaymentBps(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error('Down-payment percentage must be between 0% and 100%')
  }
}

function taskResultFromRow(row: typeof awardHandoffs.$inferSelect): AwardAutomationResult {
  const taskIds = row.task_ids
  const requiredKeys: AwardTaskKey[] = [
    'arProjectCode',
    'downPaymentInvoice',
    'cari',
    'projectTracker',
    'cxOnboarding',
  ]
  for (const key of requiredKeys) {
    if (typeof taskIds[key] !== 'string' || taskIds[key].length === 0) {
      throw new Error(`Award handoff ${row.id} has incomplete task metadata`)
    }
  }
  return {
    handoffId: row.id,
    projectId: row.project_id,
    projectCode: row.project_code,
    budgetId: row.budget_id,
    dpInvoiceId: row.dp_invoice_id,
    projectTrackerId: row.project_tracker_id,
    taskIds: taskIds as AwardTaskResult,
    reused: true,
  }
}

async function resolveCreatorId(
  tx: DatabaseTransaction,
  tenantId: string,
  actorId: string | null
): Promise<string> {
  const actor = actorId
    ? await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenant_id, tenantId), eq(users.id, actorId)))
        .limit(1)
    : []
  if (actor[0]?.id) return actor[0].id

  const [fallback] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenant_id, tenantId))
    .orderBy(asc(users.created_at))
    .limit(1)
  if (!fallback?.id) {
    throw new Error('Award automation requires at least one tenant user for audit ownership')
  }
  return fallback.id
}

async function assignProjectCode(
  tx: DatabaseTransaction,
  tenantId: string,
  projectId: string,
  existingCode: string | null,
  now: Date
): Promise<string> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'award-project-code:' + tenantId}, 0))`
  )
  if (existingCode?.trim()) {
    await tx
      .update(projects)
      .set({ status: 'active', updated_at: now })
      .where(and(eq(projects.tenant_id, tenantId), eq(projects.id, projectId)))
    return existingCode
  }

  const prefix = `PRJ-${manilaYear(now)}-`
  const [countRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.tenant_id, tenantId),
        sql`${projects.project_code} like ${prefix + '%'}`
      )
    )
  let sequence = Number(countRow?.count ?? 0) + 1
  while (sequence < 100_000) {
    const projectCode = `${prefix}${String(sequence).padStart(4, '0')}`
    const [collision] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.tenant_id, tenantId), eq(projects.project_code, projectCode)))
      .limit(1)
    if (!collision) {
      await tx
        .update(projects)
        .set({ project_code: projectCode, status: 'active', updated_at: now })
        .where(and(eq(projects.tenant_id, tenantId), eq(projects.id, projectId)))
      return projectCode
    }
    sequence += 1
  }
  throw new Error('Unable to allocate a project code for this tenant')
}

async function loadAwardLines(tx: DatabaseTransaction, tenantId: string, bomId: string) {
  const rows = await tx
    .select({
      id: bomLineItems.id,
      description: bomLineItems.description,
      kind: bomLineItems.kind,
      lineTotalCents: bomLineItems.line_total_cents,
      divisionCode: boqDivisions.code,
      divisionName: boqDivisions.name,
    })
    .from(bomLineItems)
    .leftJoin(
      boqDivisions,
      and(
        eq(bomLineItems.tenant_id, boqDivisions.tenant_id),
        eq(bomLineItems.division_id, boqDivisions.id)
      )
    )
    .where(
      and(
        eq(bomLineItems.tenant_id, tenantId),
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.is_group, 0),
        sql`${bomLineItems.line_total_cents} > 0`
      )
    )
    .orderBy(asc(bomLineItems.sort_order), asc(bomLineItems.id))

  if (rows.length === 0) throw new Error('Signed BOM has no priced line items for the budget baseline')
  return rows
}

async function ensureBudget(
  tx: DatabaseTransaction,
  args: {
    tenantId: string
    projectId: string
    bomId: string
    creatorId: string
    now: Date
    lines: Awaited<ReturnType<typeof loadAwardLines>>
  }
): Promise<string> {
  const [sourceBudget] = await tx
    .select({ id: projectBudgets.id })
    .from(projectBudgets)
    .where(
      and(
        eq(projectBudgets.tenant_id, args.tenantId),
        eq(projectBudgets.project_id, args.projectId),
        eq(projectBudgets.source_bom_id, args.bomId)
      )
    )
    .orderBy(desc(projectBudgets.revision))
    .limit(1)
  if (sourceBudget) {
    const [existingLine] = await tx
      .select({ id: projectBudgetLines.id })
      .from(projectBudgetLines)
      .where(
        and(
          eq(projectBudgetLines.tenant_id, args.tenantId),
          eq(projectBudgetLines.project_budget_id, sourceBudget.id)
        )
      )
      .limit(1)
    if (existingLine) return sourceBudget.id
  }

  const [openBudget] = await tx
    .select({ id: projectBudgets.id, sourceBomId: projectBudgets.source_bom_id })
    .from(projectBudgets)
    .where(
      and(
        eq(projectBudgets.tenant_id, args.tenantId),
        eq(projectBudgets.project_id, args.projectId),
        sql`${projectBudgets.status} in ('draft', 'pending_approval')`
      )
    )
    .orderBy(desc(projectBudgets.revision))
    .limit(1)
  if (openBudget && openBudget.sourceBomId !== args.bomId) {
    throw new Error('Project has an open budget; reconcile it before signed-BOM award')
  }
  if (openBudget) return openBudget.id

  const [latestBudget] = await tx
    .select({ revision: projectBudgets.revision })
    .from(projectBudgets)
    .where(
      and(
        eq(projectBudgets.tenant_id, args.tenantId),
        eq(projectBudgets.project_id, args.projectId)
      )
    )
    .orderBy(desc(projectBudgets.revision))
    .limit(1)
  const revision = (latestBudget?.revision ?? 0) + 1
  const totalBudgetCents = args.lines.reduce((total, line) => total + Number(line.lineTotalCents), 0)
  if (!Number.isSafeInteger(totalBudgetCents) || totalBudgetCents <= 0) {
    throw new Error('Signed BOM budget total must be a positive integer number of centavos')
  }

  const [budget] = await tx
    .insert(projectBudgets)
    .values({
      tenant_id: args.tenantId,
      project_id: args.projectId,
      source_bom_id: args.bomId,
      revision,
      status: 'draft',
      control_mode: 'warn',
      commitment_tolerance_bps: 0,
      currency: 'PHP',
      effective_from: manilaDate(args.now),
      revision_reason: 'WO-13 signed BOM award baseline',
      // The database guard requires a new draft to be empty. The linked line
      // insert trigger recomputes the authoritative total atomically below.
      total_budget_cents: 0,
      created_by: args.creatorId,
      created_at: args.now,
      updated_at: args.now,
    })
    .returning({ id: projectBudgets.id })
  if (!budget?.id) throw new Error('Project budget baseline was not created')

  const budgetLines: Array<typeof projectBudgetLines.$inferInsert> = []
  for (const [index, line] of args.lines.entries()) {
    const divisionCode = normalizeCode(line.divisionCode)
    const code = `AWD-${args.projectId.slice(0, 8)}-${divisionCode}-${String(index + 1).padStart(3, '0')}`.slice(0, 40)
    const [costCode] = await tx
      .select({ id: costCodes.id })
      .from(costCodes)
      .where(
        and(
          eq(costCodes.tenant_id, args.tenantId),
          sql`lower(${costCodes.code}) = lower(${code})`
        )
      )
      .limit(1)
    const costCodeId = costCode?.id ?? (
      await tx
        .insert(costCodes)
        .values({
          tenant_id: args.tenantId,
          code,
          name: `${divisionCode} · ${(line.divisionName ?? line.description).slice(0, 140)}`,
          category: line.kind === 'material_line' ? 'material' : 'other',
          created_by: args.creatorId,
          created_at: args.now,
          updated_at: args.now,
        })
        .returning({ id: costCodes.id })
    )[0]?.id
    if (!costCodeId) throw new Error('Cost code baseline was not created')
    budgetLines.push({
      tenant_id: args.tenantId,
      project_budget_id: budget.id,
      cost_code_id: costCodeId,
      bom_line_item_id: line.id,
      line_number: index + 1,
      description: line.description.trim() || `BOQ line ${index + 1}`,
      amount_cents: Number(line.lineTotalCents),
      created_at: args.now,
      updated_at: args.now,
    })
  }
  await tx.insert(projectBudgetLines).values(budgetLines)
  return budget.id
}

async function ensureDraftInvoice(
  tx: DatabaseTransaction,
  args: {
    tenantId: string
    projectId: string
    accountId: string | null
    projectCode: string
    tcvCents: number
    downPaymentBps: number
    creatorId: string
    now: Date
  }
): Promise<string> {
  const invoiceNumber = `AWD-DP-${args.projectCode}`
  const [existing] = await tx
    .select({ id: invoices.id, projectId: invoices.project_id })
    .from(invoices)
    .where(and(eq(invoices.tenant_id, args.tenantId), eq(invoices.invoice_number, invoiceNumber)))
    .limit(1)
  if (existing) {
    if (existing.projectId !== args.projectId) throw new Error(`Invoice number ${invoiceNumber} belongs to another project`)
    return existing.id
  }

  const subtotalCents = Math.floor((args.tcvCents * args.downPaymentBps) / 10_000)
  const [invoice] = await tx
    .insert(invoices)
    .values({
      tenant_id: args.tenantId,
      project_id: args.projectId,
      account_id: args.accountId,
      created_by: args.creatorId,
      invoice_number: invoiceNumber,
      status: 'draft',
      billing_percent_bps: args.downPaymentBps,
      retention_bps: 0,
      subtotal_cents: subtotalCents,
      retention_cents: 0,
      vat_cents: 0,
      withholding_tax_cents: 0,
      net_amount_cents: subtotalCents,
      notes:
        args.downPaymentBps === 0
          ? 'WO-13 draft placeholder; commercial down-payment rate and tax treatment require Finance confirmation.'
          : 'WO-13 draft; tax and retention treatment require Finance confirmation before issue.',
      created_at: args.now,
      updated_at: args.now,
    })
    .returning({ id: invoices.id })
  if (!invoice?.id) throw new Error('Down-payment invoice draft was not created')
  return invoice.id
}

async function ensureProcessSteps(
  tx: DatabaseTransaction,
  tenantId: string,
  creatorId: string,
  now: Date
): Promise<Map<AwardTaskKey, { id: string; slaDays: number }>> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'award-process-steps:' + tenantId}, 0))`
  )
  const result = new Map<AwardTaskKey, { id: string; slaDays: number }>()
  for (const spec of AWARD_PROCESS_STEP_SPECS) {
    const [existing] = await tx
      .select({ id: processSteps.id, slaDays: processSteps.sla_days })
      .from(processSteps)
      .where(and(eq(processSteps.tenant_id, tenantId), eq(processSteps.code, spec.code)))
      .limit(1)
    if (existing?.id) {
      result.set(spec.key, { id: existing.id, slaDays: existing.slaDays ?? spec.slaDays })
      continue
    }
    const [created] = await tx
      .insert(processSteps)
      .values({
        tenant_id: tenantId,
        code: spec.code,
        stage: 'award',
        name: spec.name,
        responsible_bu: spec.responsibleBu,
        input: spec.input,
        input_from: spec.inputFrom,
        output: spec.output,
        output_by: spec.outputBy,
        sla_days: spec.slaDays,
        sla_hours: null,
        is_business_days: true,
        clock_scope: 'internal',
        is_active: true,
        created_by: creatorId,
        updated_by: creatorId,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: processSteps.id, slaDays: processSteps.sla_days })
    if (!created?.id) throw new Error(`Process step ${spec.code} was not created`)
    result.set(spec.key, { id: created.id, slaDays: created.slaDays ?? spec.slaDays })
  }
  return result
}

async function ensureProjectTracker(
  tx: DatabaseTransaction,
  args: { tenantId: string; projectId: string; projectCode: string; bomId: string; creatorId: string; now: Date }
): Promise<string> {
  const [existing] = await tx
    .select({ id: masterSchedules.id })
    .from(masterSchedules)
    .where(
      and(
        eq(masterSchedules.tenant_id, args.tenantId),
        eq(masterSchedules.project_id, args.projectId),
        eq(masterSchedules.name, 'Project Tracker')
      )
    )
    .orderBy(desc(masterSchedules.imported_at))
    .limit(1)
  if (existing?.id) return existing.id

  const [tracker] = await tx
    .insert(masterSchedules)
    .values({
      tenant_id: args.tenantId,
      project_id: args.projectId,
      name: 'Project Tracker',
      tasks: {
        source: 'signed_bom_award',
        source_bom_id: args.bomId,
        project_code: args.projectCode,
        status: 'awaiting_ntp',
        created_at: args.now.toISOString(),
      },
      imported_at: args.now,
      imported_by: args.creatorId,
    })
    .returning({ id: masterSchedules.id })
  if (!tracker?.id) throw new Error('Project Tracker record was not created')
  return tracker.id
}

async function insertAwardTasks(
  tx: DatabaseTransaction,
  args: {
    tenantId: string
    handoffId: string
    creatorId: string
    now: Date
    steps: Map<AwardTaskKey, { id: string; slaDays: number }>
    calendar: Awaited<ReturnType<typeof resolveTenantBusinessDayService>>
  }
): Promise<AwardTaskResult> {
  const taskIds = {} as AwardTaskResult
  for (const spec of AWARD_PROCESS_STEP_SPECS) {
    const step = args.steps.get(spec.key)
    if (!step) throw new Error(`Missing process step ${spec.code}`)
    const instanceKey = `award:${args.handoffId}:${spec.key}`
    const taskId = randomUUID()
    const blocked = spec.blockedUntilNtp
    await tx.insert(taskInstances).values({
      id: taskId,
      tenant_id: args.tenantId,
      process_step_id: step.id,
      subject_type: 'award_handoff',
      subject_id: args.handoffId,
      instance_key: instanceKey,
      status: blocked ? 'blocked' : 'in_progress',
      blocked_reason: blocked ? 'Awaiting NTP date' : null,
      started_at: blocked ? null : args.now,
      created_by: args.creatorId,
      updated_by: args.creatorId,
      created_at: args.now,
      updated_at: args.now,
    })
    taskIds[spec.key] = taskId

    if (!blocked) {
      const schedule = createSlaClockSchedule(
        {
          clock_type: 'business_days',
          clock_scope: 'internal',
          target_value: step.slaDays,
          started_at: args.now,
          observe_mode: true,
          time_zone: 'Asia/Manila',
        },
        args.calendar
      )
      await tx.insert(slaClocks).values({
        tenant_id: args.tenantId,
        task_instance_id: taskId,
        clock_type: schedule.clock_type,
        clock_scope: schedule.clock_scope,
        target_value: schedule.target_value,
        started_at: schedule.started_at,
        due_at: schedule.due_at,
        at_risk_at: schedule.at_risk_at,
        escalation_at: schedule.escalation_at,
        status: 'running',
        observe_mode: schedule.observe_mode,
        created_by: args.creatorId,
        updated_by: args.creatorId,
        created_at: args.now,
        updated_at: args.now,
      })
    }
  }
  return taskIds
}

/**
 * Execute the signed-BOM handoff inside a caller-owned database transaction.
 * The caller must not send notifications until this function commits.
 */
export async function runSignedBomAward(
  tx: DatabaseTransaction,
  args: SignedBomAwardArgs
): Promise<AwardAutomationResult> {
  const now = args.now ?? new Date()
  assertValidDate(now)
  const downPaymentBps = args.downPaymentBps ?? 0
  assertDownPaymentBps(downPaymentBps)

  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${'award-handoff:' + args.tenantId + ':' + args.bomId}, 0))`
  )

  const [existing] = await tx
    .select()
    .from(awardHandoffs)
    .where(and(eq(awardHandoffs.tenant_id, args.tenantId), eq(awardHandoffs.source_bom_id, args.bomId)))
    .limit(1)
  if (existing) {
    if (existing.status === 'reversed') throw new Error('This signed BOM has a reversed award handoff')
    return taskResultFromRow(existing)
  }

  const [bom] = await tx
    .select({
      id: boms.id,
      tenantId: boms.tenant_id,
      projectId: boms.project_id,
      opportunityId: boms.opportunity_id,
      status: boms.status,
      tcvCents: boms.tcv_cents,
    })
    .from(boms)
    .where(and(eq(boms.tenant_id, args.tenantId), eq(boms.id, args.bomId)))
    .limit(1)
  if (!bom || bom.tenantId !== args.tenantId) throw new Error('BOM not found in tenant scope')
  if (bom.status !== 'locked') throw new Error('Only a locked BOM can be awarded')

  const [project] = await tx
    .select({
      id: projects.id,
      accountId: projects.account_id,
      projectCode: projects.project_code,
    })
    .from(projects)
    .where(and(eq(projects.tenant_id, args.tenantId), eq(projects.id, bom.projectId)))
    .limit(1)
  if (!project) throw new Error('BOM project not found in tenant scope')

  const [opportunityByBom] = bom.opportunityId
    ? await tx
        .select({ id: opportunities.id, projectId: opportunities.project_id })
        .from(opportunities)
        .where(and(eq(opportunities.tenant_id, args.tenantId), eq(opportunities.id, bom.opportunityId)))
        .limit(1)
    : []
  const [opportunityByProject] = !bom.opportunityId
    ? await tx
        .select({ id: opportunities.id, projectId: opportunities.project_id })
        .from(opportunities)
        .where(and(eq(opportunities.tenant_id, args.tenantId), eq(opportunities.project_id, bom.projectId)))
        .orderBy(desc(opportunities.updated_at))
        .limit(1)
    : []
  const opportunity = opportunityByBom ?? opportunityByProject ?? null
  if (opportunity?.projectId && opportunity.projectId !== bom.projectId) {
    throw new Error('BOM opportunity belongs to a different project')
  }
  if (opportunity && !opportunity.projectId) {
    await tx
      .update(opportunities)
      .set({ project_id: bom.projectId, updated_at: now })
      .where(and(eq(opportunities.tenant_id, args.tenantId), eq(opportunities.id, opportunity.id)))
  }

  const creatorId = await resolveCreatorId(tx, args.tenantId, args.actorId)
  const projectCode = await assignProjectCode(
    tx,
    args.tenantId,
    bom.projectId,
    project.projectCode,
    now
  )
  const lines = await loadAwardLines(tx, args.tenantId, args.bomId)
  const budgetId = await ensureBudget(tx, {
    tenantId: args.tenantId,
    projectId: bom.projectId,
    bomId: args.bomId,
    creatorId,
    now,
    lines,
  })
  const dpInvoiceId = await ensureDraftInvoice(tx, {
    tenantId: args.tenantId,
    projectId: bom.projectId,
    accountId: project.accountId,
    projectCode,
    tcvCents: Number(bom.tcvCents),
    downPaymentBps,
    creatorId,
    now,
  })
  const projectTrackerId = await ensureProjectTracker(tx, {
    tenantId: args.tenantId,
    projectId: bom.projectId,
    projectCode,
    bomId: args.bomId,
    creatorId,
    now,
  })
  const steps = await ensureProcessSteps(tx, args.tenantId, creatorId, now)
  const calendar = await resolveTenantBusinessDayService(args.tenantId)
  const handoffId = randomUUID()
  await tx.insert(awardHandoffs).values({
    id: handoffId,
    tenant_id: args.tenantId,
    source_bom_id: args.bomId,
    opportunity_id: opportunity?.id ?? null,
    project_id: bom.projectId,
    project_code: projectCode,
    project_was_created: false,
    budget_id: budgetId,
    dp_invoice_id: dpInvoiceId,
    project_tracker_id: projectTrackerId,
    task_ids: {},
    status: 'active',
    created_by: creatorId,
    created_at: now,
  })
  const taskIds = await insertAwardTasks(tx, {
    tenantId: args.tenantId,
    handoffId,
    creatorId,
    now,
    steps,
    calendar,
  })
  await tx
    .update(awardHandoffs)
    .set({ task_ids: taskIds })
    .where(and(eq(awardHandoffs.tenant_id, args.tenantId), eq(awardHandoffs.id, handoffId)))

  await writeAuditLogInTransaction(tx, {
    tenantId: args.tenantId,
    actorId: args.actorId ?? creatorId,
    entityType: 'award_handoff',
    entityId: handoffId,
    action: 'create',
    diff: {
      source_bom_id: args.bomId,
      project_id: bom.projectId,
      project_code: projectCode,
      project_was_created: false,
      budget_id: budgetId,
      dp_invoice_id: dpInvoiceId,
      project_tracker_id: projectTrackerId,
      task_ids: taskIds,
      down_payment_bps: downPaymentBps,
    },
  })

  return {
    handoffId,
    projectId: bom.projectId,
    projectCode,
    budgetId,
    dpInvoiceId,
    projectTrackerId,
    taskIds,
    reused: false,
  }
}

export async function runSignedBomAwardInTransaction(
  args: SignedBomAwardArgs
): Promise<AwardAutomationResult> {
  return db.transaction((tx) => runSignedBomAward(tx, args))
}
