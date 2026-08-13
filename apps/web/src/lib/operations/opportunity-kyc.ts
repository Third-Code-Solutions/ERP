import { and, eq, sql } from 'drizzle-orm'
import { db, type Database } from '@third-code-erp/database'
import {
  opportunityKycTracks,
  opportunities,
} from '@third-code-erp/database/schema'
import {
  can,
  type AppRole,
  type ErpCapability,
} from '@third-code-erp/auth'
import {
  OPPORTUNITY_KYC_TRACK_TYPES as SHARED_OPPORTUNITY_KYC_TRACK_TYPES,
  opportunityKycTrackLabel as sharedOpportunityKycTrackLabel,
  opportunityKycTrackStatusLabel,
  opportunityKycTrackCommandSchema,
  type OpportunityKycTrackAction,
  type OpportunityKycTrackStatus,
  type OpportunityKycTrackType,
} from '@third-code-erp/shared-types'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { resolveTenantBusinessDayService } from './business-calendar'

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export const OPPORTUNITY_KYC_TRACK_TYPES = SHARED_OPPORTUNITY_KYC_TRACK_TYPES

export function opportunityKycTrackLabel(trackType: OpportunityKycTrackType): string {
  return sharedOpportunityKycTrackLabel(trackType)
}

export function opportunityKycGateMessage(
  tracks: ReadonlyArray<{
    track_type: OpportunityKycTrackType
    status: OpportunityKycTrackStatus
    decision_reason: string | null
  }>
): string | null {
  if (tracks.length !== OPPORTUNITY_KYC_TRACK_TYPES.length) {
    return 'Pipeline locked: PPRF dual-track review is not initialized.'
  }

  const blocked = tracks.filter((track) => track.status !== 'approved')
  if (blocked.length === 0) return null

  const detail = blocked
    .map((track) => {
      const label = opportunityKycTrackLabel(track.track_type)
      const reason = track.decision_reason?.trim()
      return `${label}: ${track.status.replace('_', ' ')}${reason ? ` — ${reason}` : ''}`
    })
    .join('; ')

  return `Pipeline locked until both Finance tracks are approved. ${detail}`
}

export async function getOpportunityKycTracks(
  tenantId: string,
  opportunityId: string
) {
  return dbSelectTracks(tenantId, opportunityId)
}

async function dbSelectTracks(tenantId: string, opportunityId: string) {
  return db
    .select()
    .from(opportunityKycTracks)
    .where(
      and(
        eq(opportunityKycTracks.tenant_id, tenantId),
        eq(opportunityKycTracks.opportunity_id, opportunityId)
      )
    )
    .orderBy(opportunityKycTracks.track_type)
}

/** Add two tenant-aware business days and return end-of-day Manila time. */
export async function opportunityKycDueAt(
  tenantId: string,
  from = new Date()
): Promise<Date> {
  const calendar = await resolveTenantBusinessDayService(tenantId)
  const manilaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(from)
  const dueDate = calendar.add(manilaDate, 2)
  return new Date(`${dueDate}T23:59:59.999+08:00`)
}

export async function initializeOpportunityKycTracks(
  tx: DatabaseTransaction,
  args: {
    tenantId: string
    opportunityId: string
    dueAt: Date
  }
): Promise<void> {
  await tx
    .insert(opportunityKycTracks)
    .values(
      OPPORTUNITY_KYC_TRACK_TYPES.map((trackType) => ({
        tenant_id: args.tenantId,
        opportunity_id: args.opportunityId,
        track_type: trackType,
        status: 'pending' as const,
        due_at: args.dueAt,
      }))
    )
    .onConflictDoUpdate({
      target: [
        opportunityKycTracks.tenant_id,
        opportunityKycTracks.opportunity_id,
        opportunityKycTracks.track_type,
      ],
      set: {
        status: 'pending',
        due_at: args.dueAt,
        prepared_by: null,
        prepared_at: null,
        fc_recommended_by: null,
        fc_recommended_at: null,
        president_decided_by: null,
        president_decided_at: null,
        decision_reason: null,
        notes: null,
        updated_at: new Date(),
      },
    })
}

interface ApplyTrackActionArgs {
  tenantId: string
  actorId: string
  actorRole: AppRole
  input: unknown
}

export type ApplyTrackActionResult =
  | {
      ok: true
      trackId: string
      status: OpportunityKycTrackStatus
    }
  | {
      ok: false
      error: string
    }

function capabilityForAction(action: OpportunityKycTrackAction): ErpCapability {
  return action === 'approve' || action === 'reject'
    ? 'opportunity.kyc_track_approve'
    : 'opportunity.kyc_track_manage'
}

export async function applyOpportunityKycTrackAction(
  args: ApplyTrackActionArgs
): Promise<ApplyTrackActionResult> {
  const parsed = opportunityKycTrackCommandSchema.safeParse(args.input)
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return {
      ok: false,
      error: `${first?.path.join('.') || 'command'}: ${first?.message || 'invalid input'}`,
    }
  }

  const input = parsed.data
  const capability = capabilityForAction(input.action)
  if (!can(args.actorRole, capability)) {
    return {
      ok: false,
      error: `Forbidden: role "${args.actorRole}" lacks "${capability}"`,
    }
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'opportunity-kyc:' + args.tenantId + ':' + input.opportunity_id}, 0))`
    )

    const [opportunity] = await tx
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.id, input.opportunity_id),
          eq(opportunities.tenant_id, args.tenantId)
        )
      )
      .limit(1)
    if (!opportunity) return { ok: false, error: 'Opportunity not found' }

    const [track] = await tx
      .select()
      .from(opportunityKycTracks)
      .where(
        and(
          eq(opportunityKycTracks.tenant_id, args.tenantId),
          eq(opportunityKycTracks.opportunity_id, input.opportunity_id),
          eq(opportunityKycTracks.track_type, input.track_type)
        )
      )
      .limit(1)
    if (!track) {
      return {
        ok: false,
        error: 'PPRF dual-track review is not initialized for this opportunity',
      }
    }

    const now = new Date()
    const notes = input.notes?.trim() || null
    const base = {
      updated_at: now,
      notes: notes ?? track.notes,
    }

    let update: Partial<typeof opportunityKycTracks.$inferInsert>
    switch (input.action) {
      case 'start':
        if (track.status !== 'pending' && track.status !== 'in_review') {
          return { ok: false, error: `Cannot start a ${track.status} track` }
        }
        update = {
          ...base,
          status: 'in_review',
          prepared_by: track.prepared_by ?? args.actorId,
          prepared_at: track.prepared_at ?? now,
        }
        break
      case 'recommend':
        if (track.status === 'approved' || track.status === 'rejected') {
          return { ok: false, error: `Cannot recommend a ${track.status} track` }
        }
        update = {
          ...base,
          status: 'in_review',
          prepared_by: track.prepared_by ?? args.actorId,
          prepared_at: track.prepared_at ?? now,
          fc_recommended_by: args.actorId,
          fc_recommended_at: now,
          decision_reason: null,
        }
        break
      case 'approve':
        if (!track.fc_recommended_at) {
          return { ok: false, error: 'FC recommendation is required before President approval' }
        }
        if (track.status === 'rejected') {
          return { ok: false, error: 'Rejected track requires a new PPRF submission' }
        }
        update = {
          ...base,
          status: 'approved',
          president_decided_by: args.actorId,
          president_decided_at: now,
          decision_reason: null,
        }
        break
      case 'flag':
        if (!notes) return { ok: false, error: 'Notes are required when flagging a track' }
        update = {
          ...base,
          status: 'flagged',
          decision_reason: notes,
          president_decided_by: null,
          president_decided_at: null,
        }
        break
      case 'reject':
        if (!notes) return { ok: false, error: 'Notes are required when rejecting a track' }
        update = {
          ...base,
          status: 'rejected',
          decision_reason: notes,
          president_decided_by: args.actorId,
          president_decided_at: now,
        }
        break
    }

    await tx
      .update(opportunityKycTracks)
      .set(update)
      .where(
        and(
          eq(opportunityKycTracks.id, track.id),
          eq(opportunityKycTracks.tenant_id, args.tenantId)
        )
      )

    const nextStatus = update.status ?? track.status
    await writeAuditLogInTransaction(tx, {
      tenantId: args.tenantId,
      actorId: args.actorId,
      entityType: 'opportunity_kyc_track',
      entityId: track.id,
      action: nextStatus === 'approved' ? 'approve' : 'status_change',
      diff: {
        opportunity_id: input.opportunity_id,
        track_type: input.track_type,
        action: input.action,
        status: { before: track.status, after: nextStatus },
        notes: notes ?? null,
      },
    })

    return { ok: true, trackId: track.id, status: nextStatus }
  })
}

export function trackStatusLabel(status: OpportunityKycTrackStatus): string {
  return opportunityKycTrackStatusLabel(status)
}
