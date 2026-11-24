/**
 * Pure read model for the "Open deadlines" panel on /process.
 *
 * Open `sla_logs` rows are the real deadline source (see sla-clock.ts). Status
 * is computed from the stored clock at request time with getSlaProgress, so the
 * panel needs no edge function and cannot go stale between checker runs.
 */
import {
  philippineBusinessDays,
  type BusinessDayService,
} from '@third-code-erp/shared-types'
import type { SlaLabel } from './sla-clock'
import {
  dateInPhilippines,
  getSlaProgress,
  parseSlaConfig,
  type SlaProgress,
} from './sla-clock-utils'

export type DeadlineStatus = 'overdue' | 'at_risk' | 'on_track'

export interface OpenSlaLogRow {
  id: string
  entity_type: string
  entity_id: string
  sla_label: string
  started_at: Date
  sla_seconds: unknown
}

/** What the panel could learn about the row's subject; both parts are optional. */
export interface DeadlineSubject {
  projectId: string | null
  name: string | null
}

export type DeadlineSubjectLookup = ReadonlyMap<string, DeadlineSubject>

export interface OpenDeadline {
  id: string
  label: string
  subject: string
  subjectName: string | null
  href: string | null
  status: DeadlineStatus
  unit: SlaProgress['unit']
  /** Total minus elapsed, in `unit`; zero or below once the deadline has passed. */
  remaining: number
  dueAt: Date
}

const SLA_LABEL_TEXT: Record<SlaLabel, string> = {
  'opp.kyc_review': 'KYC review',
  'opp.stage_response': 'Opportunity stage response',
  'pprf.review': 'PPRF review',
  'inspection.design_handoff': 'Inspection hand-off to design',
  'design.client_presentation': 'Design presentation to client',
  'bom.client_signature': 'Client BOM signature',
  'rfq.supplier_response': 'Supplier quote response',
  'po.commercial_approval': 'Purchase order commercial approval',
  'precon.checklist_item': 'Pre-construction checklist item',
  'permit.status_update': 'Permit status update',
  'punchlist.due_date': 'Punchlist item due',
  'ticket.acknowledge': 'Warranty ticket acknowledgement',
  'ticket.schedule': 'Warranty ticket scheduling',
}

const SUBJECT_TEXT: Record<string, string> = {
  opportunity: 'Opportunity',
  pre_con_checklist_item: 'Checklist item',
  permit: 'Permit',
  punchlist_item: 'Punchlist item',
  warranty_ticket: 'Warranty ticket',
  daily_task: 'Daily task',
}

const STATUS_RANK: Record<DeadlineStatus, number> = {
  overdue: 0,
  at_risk: 1,
  on_track: 2,
}

const HOUR_MS = 60 * 60 * 1000
const HOURS_PER_DAY = 24

export function humanizeCode(value: string): string {
  const words = value.replace(/[._]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function deadlineLabel(slaLabel: string): string {
  return SLA_LABEL_TEXT[slaLabel as SlaLabel] ?? humanizeCode(slaLabel)
}

export function deadlineSubject(entityType: string): string {
  return SUBJECT_TEXT[entityType] ?? humanizeCode(entityType)
}

export function subjectKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`
}

/**
 * Where to open the subject. Permits and checklist items live under a project,
 * so they need the project id looked up by the caller; an unknown entity type
 * has no link rather than a guessed one.
 */
export function deadlineHref(
  entityType: string,
  entityId: string,
  projectId: string | null
): string | null {
  switch (entityType) {
    case 'opportunity':
      return `/crm/opportunities/${entityId}`
    case 'punchlist_item':
      return `/punchlist/${entityId}`
    case 'warranty_ticket':
      return `/warranty/${entityId}`
    case 'daily_task':
      return '/tasks'
    case 'permit':
      return projectId ? `/projects/${projectId}/permits` : null
    case 'pre_con_checklist_item':
      return projectId ? `/projects/${projectId}/checklist` : null
    default:
      return null
  }
}

function classify(progress: SlaProgress): DeadlineStatus {
  if (progress.elapsed >= progress.total) return 'overdue'
  if (progress.elapsed >= progress.warning_at) return 'at_risk'
  return 'on_track'
}

function dueAt(
  progress: SlaProgress,
  startedAt: Date,
  businessDays: BusinessDayService
): Date {
  if (progress.unit === 'calendar_hours') {
    return new Date(startedAt.getTime() + progress.total * HOUR_MS)
  }
  // The clock breaches on the business day that is `total` days after the start.
  const dueDate = businessDays.add(dateInPhilippines(startedAt), progress.total)
  return new Date(`${dueDate}T00:00:00+08:00`)
}

export interface BuildOpenDeadlinesInput {
  rows: readonly OpenSlaLogRow[]
  now: Date
  /** Tenant calendar; the national calendar is used when omitted. */
  businessDays?: BusinessDayService
  subjects: DeadlineSubjectLookup
  /** Role gate: a row whose link the viewer cannot open is not listed at all. */
  canView: (href: string) => boolean
}

/**
 * Rows with an unreadable clock config are skipped, as the SLA checker does.
 * Most urgent first: overdue (longest overdue first), then at risk, then on
 * track, each ordered by due time.
 */
export function buildOpenDeadlines(input: BuildOpenDeadlinesInput): OpenDeadline[] {
  const calendar = input.businessDays ?? philippineBusinessDays
  const deadlines: OpenDeadline[] = []

  for (const row of input.rows) {
    const config = parseSlaConfig(row.sla_seconds)
    if (!config) continue

    const subject = input.subjects.get(subjectKey(row.entity_type, row.entity_id))
    const href = deadlineHref(row.entity_type, row.entity_id, subject?.projectId ?? null)
    if (href !== null && !input.canView(href)) continue

    const startedAt = new Date(row.started_at)
    const progress = getSlaProgress(config, startedAt, input.now, calendar)
    deadlines.push({
      id: row.id,
      label: deadlineLabel(row.sla_label),
      subject: deadlineSubject(row.entity_type),
      subjectName: subject?.name ?? null,
      href,
      status: classify(progress),
      unit: progress.unit,
      remaining: progress.total - progress.elapsed,
      dueAt: dueAt(progress, startedAt, calendar),
    })
  }

  return deadlines.sort(
    (left, right) =>
      STATUS_RANK[left.status] - STATUS_RANK[right.status] ||
      left.dueAt.getTime() - right.dueAt.getTime()
  )
}

export function summarizeDeadlines(
  deadlines: readonly OpenDeadline[]
): Record<DeadlineStatus, number> {
  const summary: Record<DeadlineStatus, number> = { overdue: 0, at_risk: 0, on_track: 0 }
  for (const deadline of deadlines) summary[deadline.status] += 1
  return summary
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

/** "2 business days left", "3 business days overdue", "5 hours left", "Deadline reached today". */
export function formatDeadlineRemaining(deadline: Pick<OpenDeadline, 'remaining' | 'unit'>): string {
  // Zero remaining is the moment the checker would call the clock breached.
  const pastDue = deadline.remaining <= 0
  const suffix = pastDue ? 'overdue' : 'left'
  if (deadline.unit === 'business_days') {
    const days = Math.round(Math.abs(deadline.remaining))
    return days === 0 ? 'Deadline reached today' : `${plural(days, 'business day')} ${suffix}`
  }
  const hours = Math.abs(deadline.remaining)
  if (hours < 1) return pastDue ? 'Less than an hour overdue' : 'Less than an hour left'
  if (hours >= 2 * HOURS_PER_DAY) {
    return `${plural(Math.round(hours / HOURS_PER_DAY), 'day')} ${suffix}`
  }
  return `${plural(Math.round(hours), 'hour')} ${suffix}`
}
