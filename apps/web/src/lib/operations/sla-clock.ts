/**
 * SLA clock helper.
 *
 * Server actions that change pipeline stage, submit forms, open tickets
 * (etc.) call startSlaClock() to insert a row in `sla_logs`. The
 * `sla-checker` Supabase edge function scans this table every 30 min
 * and emits warn/breach notifications via dispatchNotification.
 *
 * Why a helper: keeps business-day and calendar-hour policy in one place
 * rather than scattering clock semantics across server actions.
 */

import { db } from '@third-code-erp/database'
import { slaLogs } from '@third-code-erp/database/schema'
import { and, eq, isNull } from 'drizzle-orm'
import type { SlaConfig } from './sla-clock-utils'

export type SlaLabel =
  | 'opp.kyc_review'
  | 'opp.stage_response'
  | 'pprf.review'
  | 'inspection.design_handoff'
  | 'design.client_presentation'
  | 'bom.client_signature'
  | 'rfq.supplier_response'
  | 'po.commercial_approval'
  | 'precon.checklist_item'
  | 'permit.status_update'
  | 'punchlist.due_date'
  | 'ticket.acknowledge'
  | 'ticket.schedule'

const SLA_TABLE: Record<SlaLabel, SlaConfig> = {
  'opp.kyc_review': { clock_type: 'business_days', breach_business_days: 3, warning_at_pct: 0.8 },
  'opp.stage_response': { clock_type: 'business_days', breach_business_days: 5, warning_at_pct: 0.8 },
  'pprf.review': { clock_type: 'business_days', breach_business_days: 2, warning_at_pct: 0.8 },
  'inspection.design_handoff': { clock_type: 'business_days', breach_business_days: 1, warning_at_pct: 0.8 },
  'design.client_presentation': { clock_type: 'business_days', breach_business_days: 7, warning_at_pct: 0.8 },
  'bom.client_signature': { clock_type: 'business_days', breach_business_days: 14, warning_at_pct: 0.7 },
  'rfq.supplier_response': { clock_type: 'business_days', breach_business_days: 7, warning_at_pct: 0.8 },
  'po.commercial_approval': { clock_type: 'business_days', breach_business_days: 2, warning_at_pct: 0.8 },
  'precon.checklist_item': { clock_type: 'business_days', breach_business_days: 5, warning_at_pct: 0.8 },
  'permit.status_update': { clock_type: 'business_days', breach_business_days: 7, warning_at_pct: 0.8 },
  'punchlist.due_date': { clock_type: 'business_days', breach_business_days: 5, warning_at_pct: 0.8 },
  'ticket.acknowledge': { clock_type: 'calendar_hours', breach_at_seconds: 24 * 3600, warning_at_pct: 0.8 },
  'ticket.schedule': { clock_type: 'calendar_hours', breach_at_seconds: 48 * 3600, warning_at_pct: 0.8 },
}

interface StartArgs {
  tenantId: string
  entityType: string
  entityId: string
  label: SlaLabel
}

export async function startSlaClock(args: StartArgs): Promise<void> {
  const cfg = SLA_TABLE[args.label]
  if (!cfg) throw new Error(`Unknown SLA label: ${args.label}`)

  // Don't start a duplicate open clock for the same entity+label.
  const existing = await db
    .select({ id: slaLogs.id })
    .from(slaLogs)
    .where(
      and(
        eq(slaLogs.tenant_id, args.tenantId),
        eq(slaLogs.entity_type, args.entityType),
        eq(slaLogs.entity_id, args.entityId),
        eq(slaLogs.sla_label, args.label),
        isNull(slaLogs.completed_at)
      )
    )
    .limit(1)
  if (existing.length > 0) return

  await db.insert(slaLogs).values({
    tenant_id: args.tenantId,
    entity_type: args.entityType,
    entity_id: args.entityId,
    sla_label: args.label,
    sla_seconds: cfg,
  })
}

/**
 * Mark an SLA clock complete. Idempotent.
 */
export async function stopSlaClock(args: Omit<StartArgs, 'label'> & { label?: SlaLabel }): Promise<void> {
  const conds = [
    eq(slaLogs.tenant_id, args.tenantId),
    eq(slaLogs.entity_type, args.entityType),
    eq(slaLogs.entity_id, args.entityId),
    isNull(slaLogs.completed_at),
  ]
  if (args.label) conds.push(eq(slaLogs.sla_label, args.label))

  await db
    .update(slaLogs)
    .set({ completed_at: new Date() })
    .where(and(...conds))
}

export const SLA_CONFIG = SLA_TABLE
