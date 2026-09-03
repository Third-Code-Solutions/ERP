import { and, asc, eq, gte, lt } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@third-code-erp/database'
import {
  accounts,
  opportunities,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  opportunityStageValues,
  type OpportunityStage,
} from '@third-code-erp/shared-types/opportunities'

export const OPPORTUNITY_EXPORT_MAX_ROWS = 10_000
export const OPPORTUNITY_EXPORT_QUERY_LIMIT = OPPORTUNITY_EXPORT_MAX_ROWS + 1

export interface OpportunityExportFilters {
  sinceInclusive?: Date
  untilExclusive?: Date
  stage?: OpportunityStage
}

export interface OpportunityExportRow {
  id: string
  account_name: string
  project_name: string
  stage: OpportunityStage
  tcv_php: string
  gp_php: string
  probability: number
  weighted_tcv_php: string
  closing_date: string
  rep_email: string
}

const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1_000

function calendarParts(value: string): [number, number, number] {
  const [year, month, day] = value.split('-').map(Number)
  return [year ?? 0, month ?? 0, day ?? 0]
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = calendarParts(value)
  const candidate = new Date(0)
  candidate.setUTCHours(0, 0, 0, 0)
  candidate.setUTCFullYear(year, month - 1, day)
  return (
    year >= 1 &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  )
}

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate)

const rawFilterSchema = z
  .object({
    since: dateOnlySchema.optional(),
    until: dateOnlySchema.optional(),
    stage: z.enum(opportunityStageValues).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.since && value.until && value.since > value.until) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['until'],
        message: '`until` must not precede `since`.',
      })
    }
  })

function manilaDayStart(value: string, dayOffset = 0): Date {
  const [year, month, day] = calendarParts(value)
  const utcCalendarStart = new Date(0)
  utcCalendarStart.setUTCHours(0, 0, 0, 0)
  utcCalendarStart.setUTCFullYear(year, month - 1, day + dayOffset)
  return new Date(utcCalendarStart.getTime() - MANILA_UTC_OFFSET_MS)
}

export type OpportunityExportFilterParseResult =
  | { success: true; data: OpportunityExportFilters }
  | { success: false }

export function parseOpportunityExportFilters(
  searchParams: URLSearchParams,
): OpportunityExportFilterParseResult {
  const grouped = new Map<string, string[]>()
  for (const [key, value] of searchParams.entries()) {
    grouped.set(key, [...(grouped.get(key) ?? []), value])
  }

  const raw: Record<string, string | string[]> = Object.fromEntries(
    [...grouped.entries()].map(([key, values]) => [
      key,
      values.length === 1 ? values[0]! : values,
    ]),
  )
  const parsed = rawFilterSchema.safeParse(raw)
  if (!parsed.success) return { success: false }

  return {
    success: true,
    data: {
      sinceInclusive: parsed.data.since
        ? manilaDayStart(parsed.data.since)
        : undefined,
      untilExclusive: parsed.data.until
        ? manilaDayStart(parsed.data.until, 1)
        : undefined,
      stage: parsed.data.stage,
    },
  }
}

export async function getOpportunityExportRows(
  tenantId: string,
  filters: OpportunityExportFilters,
): Promise<OpportunityExportRow[]> {
  const conditions = [eq(opportunities.tenant_id, tenantId)]
  if (filters.sinceInclusive) {
    conditions.push(gte(opportunities.closing_date, filters.sinceInclusive))
  }
  if (filters.untilExclusive) {
    conditions.push(lt(opportunities.closing_date, filters.untilExclusive))
  }
  if (filters.stage) {
    conditions.push(eq(opportunities.stage, filters.stage))
  }

  const rows = await db
    .select({
      id: opportunities.id,
      accountName: accounts.name,
      projectName: projects.name,
      projectClient: projects.client,
      stage: opportunities.stage,
      tcv: opportunities.tcv_cents,
      gp: opportunities.gp_cents,
      probability: opportunities.probability,
      weighted: opportunities.weighted_tcv_cents,
      closingDate: opportunities.closing_date,
      repEmail: users.email,
    })
    .from(opportunities)
    .leftJoin(
      accounts,
      and(
        eq(opportunities.account_id, accounts.id),
        eq(opportunities.tenant_id, accounts.tenant_id),
      ),
    )
    .leftJoin(
      projects,
      and(
        eq(opportunities.project_id, projects.id),
        eq(opportunities.tenant_id, projects.tenant_id),
      ),
    )
    .leftJoin(
      users,
      and(
        eq(opportunities.rep_id, users.id),
        eq(opportunities.tenant_id, users.tenant_id),
      ),
    )
    .where(and(...conditions))
    .orderBy(asc(opportunities.id))
    .limit(OPPORTUNITY_EXPORT_QUERY_LIMIT)

  return rows.map((row) => ({
    id: row.id,
    account_name: row.accountName ?? row.projectClient ?? '',
    project_name: row.projectName ?? '',
    stage: row.stage,
    tcv_php: ((row.tcv ?? 0) / 100).toFixed(2),
    gp_php: ((row.gp ?? 0) / 100).toFixed(2),
    probability: row.probability ?? 0,
    weighted_tcv_php: ((row.weighted ?? 0) / 100).toFixed(2),
    closing_date: row.closingDate
      ? row.closingDate.toISOString().slice(0, 10)
      : '',
    rep_email: row.repEmail ?? '',
  }))
}

const CSV_COLUMNS = [
  { key: 'id', untrustedText: false },
  { key: 'account_name', untrustedText: true },
  { key: 'project_name', untrustedText: true },
  { key: 'stage', untrustedText: false },
  { key: 'tcv_php', untrustedText: false },
  { key: 'gp_php', untrustedText: false },
  { key: 'probability', untrustedText: false },
  { key: 'weighted_tcv_php', untrustedText: false },
  { key: 'closing_date', untrustedText: false },
  { key: 'rep_email', untrustedText: true },
] as const satisfies ReadonlyArray<{
  key: keyof OpportunityExportRow
  untrustedText: boolean
}>

export const OPPORTUNITY_EXPORT_HEADERS = CSV_COLUMNS.map(({ key }) => key)

export function csvCell(value: string, untrustedText: boolean): string {
  const neutralized =
    untrustedText && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized
}

export function opportunityExportCsvLine(row: OpportunityExportRow): string {
  return CSV_COLUMNS.map(({ key, untrustedText }) =>
    csvCell(String(row[key] ?? ''), untrustedText),
  ).join(',')
}
