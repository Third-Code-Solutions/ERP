/**
 * SLA clock helper.
 *
 * Server actions that change pipeline stage, submit forms, open tickets
 * (etc.) call startSlaClock() to insert a row in `sla_logs`. The
 * `sla-checker` Supabase edge function scans this table every 30 min
 * and emits warn/breach notifications via dispatchNotification.
 *
 * Why a helper: keeps SLA seconds + warn-thresholds in one place rather
 * than scattered across server actions.
 */

import { db } from '@third-code-erp/database'
import { slaLogs } from '@third-code-erp/database/schema'
import { and, eq, isNull } from 'drizzle-orm'

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

interface SlaConfig {
  /** Total time-to-breach in seconds. */
  breach_at_seconds: number
  /** Fraction of total at which to emit a warning. 0.8 = at 80% elapsed. */
  warning_at_pct: number
}

// PH business norms — 1 day == 24h here (not business hours) for simplicity.
const SLA_TABLE: Record<SlaLabel, SlaConfig> = {
  'opp.kyc_review':           { breach_at_seconds: 3 * 86400, warning_at_pct: 0.8 },
  'opp.stage_response':       { breach_at_seconds: 5 * 86400, warning_at_pct: 0.8 },
  'pprf.review':              { breach_at_seconds: 2 * 86400, warning_at_pct: 0.8 },
  'inspection.design_handoff':{ breach_at_seconds: 1 * 86400, warning_at_pct: 0.8 },
  'design.client_presentation': { breach_at_seconds: 7 * 86400, warning_at_pct: 0.8 },
  'bom.client_signature':     { breach_at_seconds: 14 * 86400, warning_at_pct: 0.7 },
  'rfq.supplier_response':    { breach_at_seconds: 7 * 86400, warning_at_pct: 0.8 },
  'po.commercial_approval':   { breach_at_seconds: 2 * 86400, warning_at_pct: 0.8 },
  'precon.checklist_item':    { breach_at_seconds: 5 * 86400, warning_at_pct: 0.8 },
  'permit.status_update':     { breach_at_seconds: 7 * 86400, warning_at_pct: 0.8 },
  'punchlist.due_date':       { breach_at_seconds: 5 * 86400, warning_at_pct: 0.8 },
  'ticket.acknowledge':       { breach_at_seconds: 24 * 3600, warning_at_pct: 0.8 },
  'ticket.schedule':          { breach_at_seconds: 48 * 3600, warning_at_pct: 0.8 },
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
