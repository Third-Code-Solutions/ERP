'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { can, requireUserProfile, type AppRole, type ErpCapability } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  documents,
  opportunities,
  tenderDeviations,
  tenderEvaluationCriteria,
  tenderEvaluationScores,
  tenderPackages,
  tenderVendorProfiles,
  vendors,
} from '@third-code-erp/database/schema'
import { stampActorInTransaction, writeAuditLogInTransaction } from '@/lib/audit'

function forbid(role: AppRole, capability: ErpCapability): string | null {
  return can(role, capability) ? null : `Forbidden: role "${role}" lacks "${capability}"`
}

function parseUuid(value: FormDataEntryValue | null, label: string): string {
  const parsed = z.string().uuid().safeParse(value)
  if (!parsed.success) throw new Error(`${label} must be a valid UUID`)
  return parsed.data
}

function parseText(value: FormDataEntryValue | null, label: string, max: number, required = true): string {
  const schema = required ? z.string().trim().min(1).max(max) : z.string().trim().max(max).default('')
  const parsed = schema.safeParse(value ?? '')
  if (!parsed.success) throw new Error(`${label} is invalid`)
  return parsed.data
}

async function assertOpportunity(tenantId: string, opportunityId: string) {
  const [row] = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, tenantId))).limit(1)
  if (!row) throw new Error('Opportunity not found')
}

async function assertOpportunityDocument(tenantId: string, opportunityId: string, documentId: string | null, label: string) {
  if (!documentId) return
  const [row] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, documentId), eq(documents.tenant_id, tenantId), eq(documents.opportunity_id, opportunityId))).limit(1)
  if (!row) throw new Error(`${label} document not found for this opportunity`)
}

function tenderPath(opportunityId: string): string {
  return `/crm/opportunities/${opportunityId}/proposal/tender`
}

export async function createTenderPackage(formData: FormData): Promise<{ error?: string }> {
  try {
    const profile = await requireUserProfile()
    const denied = forbid(profile.role, 'tender.manage')
    if (denied) return { error: denied }
    const opportunityId = parseUuid(formData.get('opportunityId'), 'Opportunity')
    const title = parseText(formData.get('title'), 'Title', 255)
    const reference = parseText(formData.get('reference'), 'Reference', 120)
    const sourceMode = z.enum(['client_issued_boq', 'abi_generated_bom']).parse(formData.get('sourceMode'))
    const torDocumentId = formData.get('torDocumentId') ? parseUuid(formData.get('torDocumentId'), 'TOR document') : null
    const boqDocumentId = formData.get('boqDocumentId') ? parseUuid(formData.get('boqDocumentId'), 'BOQ document') : null
    if (sourceMode === 'client_issued_boq' && !boqDocumentId) return { error: 'Client-issued BOQ mode requires a BOQ document.' }
    await assertOpportunity(profile.tenantId, opportunityId)
    await assertOpportunityDocument(profile.tenantId, opportunityId, torDocumentId, 'TOR')
    await assertOpportunityDocument(profile.tenantId, opportunityId, boqDocumentId, 'BOQ')
    const closingRaw = formData.get('closingAt')?.toString().trim() ?? ''
    const closingAt = closingRaw ? new Date(closingRaw) : null
    if (closingAt && Number.isNaN(closingAt.getTime())) return { error: 'Closing date is invalid.' }
    const clientRequestId = formData.get('clientRequestId') ? parseUuid(formData.get('clientRequestId'), 'Request') : randomUUID()
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'tender-create:' + profile.tenantId + ':' + clientRequestId}, 0))`)
      const [existing] = await tx.select({
        id: tenderPackages.id,
        opportunityId: tenderPackages.opportunity_id,
        title: tenderPackages.title,
        reference: tenderPackages.reference,
        sourceMode: tenderPackages.source_mode,
        torDocumentId: tenderPackages.tor_document_id,
        boqDocumentId: tenderPackages.boq_document_id,
        closingAt: tenderPackages.closing_at,
      }).from(tenderPackages).where(and(eq(tenderPackages.tenant_id, profile.tenantId), eq(tenderPackages.client_request_id, clientRequestId))).limit(1).for('update')
      if (existing) {
        const samePayload = existing.opportunityId === opportunityId
          && existing.title === title
          && existing.reference === reference
          && existing.sourceMode === sourceMode
          && existing.torDocumentId === torDocumentId
          && existing.boqDocumentId === boqDocumentId
          && (existing.closingAt?.toISOString() ?? null) === (closingAt?.toISOString() ?? null)
        if (!samePayload) throw new Error('Client request id was already used for a different tender')
        return
      }
      const [created] = await tx.insert(tenderPackages).values({ tenant_id: profile.tenantId, opportunity_id: opportunityId, title, reference, source_mode: sourceMode, tor_document_id: torDocumentId, boq_document_id: boqDocumentId, closing_at: closingAt, client_request_id: clientRequestId, created_by: profile.user.id }).returning({ id: tenderPackages.id })
      if (!created) throw new Error('Tender could not be created')
      await writeAuditLogInTransaction(tx, { tenantId: profile.tenantId, actorId: profile.user.id, entityType: 'tender_package', entityId: created.id, action: 'create', diff: { opportunity_id: opportunityId, source_mode: sourceMode, reference } })
    })
    revalidatePath(tenderPath(opportunityId))
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Tender could not be created.' }
  }
}

export async function transitionTender(formData: FormData): Promise<{ error?: string }> {
  try {
    const profile = await requireUserProfile()
    const opportunityId = parseUuid(formData.get('opportunityId'), 'Opportunity')
    const tenderId = parseUuid(formData.get('tenderId'), 'Tender')
    const expectedVersion = z.coerce.number().int().min(1).parse(formData.get('expectedVersion'))
    const status = z.enum(['draft', 'open', 'evaluating', 'submitted', 'closed']).parse(formData.get('status'))
    const denied = forbid(profile.role, status === 'submitted' ? 'tender.evaluate' : 'tender.manage')
    if (denied) return { error: denied }
    const allowed: Record<string, string[]> = { draft: ['open', 'closed'], open: ['evaluating', 'closed'], evaluating: ['submitted', 'closed'], submitted: ['closed'], closed: [] }
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [current] = await tx.select({ status: tenderPackages.status, version: tenderPackages.version }).from(tenderPackages).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.opportunity_id, opportunityId), eq(tenderPackages.tenant_id, profile.tenantId))).limit(1).for('update')
      if (!current) throw new Error('Tender not found')
      if (current.version !== expectedVersion) throw new Error('Tender changed; refresh before trying again')
      if (current.status === status) return
      if (!allowed[current.status]?.includes(status)) throw new Error(`Cannot transition ${current.status} → ${status}`)
      if (status === 'submitted') {
        const [criteria, profiles, scores] = await Promise.all([
          tx.select({ id: tenderEvaluationCriteria.id, isRequired: tenderEvaluationCriteria.is_required }).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.tenant_id, profile.tenantId), eq(tenderEvaluationCriteria.tender_id, tenderId))),
          tx.select({ id: tenderVendorProfiles.id }).from(tenderVendorProfiles).where(and(eq(tenderVendorProfiles.tenant_id, profile.tenantId), eq(tenderVendorProfiles.tender_id, tenderId))),
          tx.select({ vendorProfileId: tenderEvaluationScores.vendor_profile_id, criterionId: tenderEvaluationScores.criterion_id }).from(tenderEvaluationScores).where(and(eq(tenderEvaluationScores.tenant_id, profile.tenantId), eq(tenderEvaluationScores.tender_id, tenderId))),
        ])
        if (profiles.length === 0) throw new Error('Add at least one vendor profile before submission')
        const required = criteria.filter((criterion) => criterion.isRequired)
        for (const vendorProfile of profiles) {
          const profileScores = scores.filter((score) => score.vendorProfileId === vendorProfile.id)
          if (required.some((criterion) => !profileScores.some((score) => score.criterionId === criterion.id))) throw new Error('Every vendor profile needs a score for each required criterion')
        }
      }
      const [updated] = await tx.update(tenderPackages).set({ status, submitted_at: status === 'submitted' ? new Date() : undefined, version: current.version + 1, updated_at: new Date() }).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.tenant_id, profile.tenantId), eq(tenderPackages.version, current.version))).returning({ id: tenderPackages.id })
      if (!updated) throw new Error('Tender changed; refresh before trying again')
      await writeAuditLogInTransaction(tx, { tenantId: profile.tenantId, actorId: profile.user.id, entityType: 'tender_package', entityId: tenderId, action: 'status_change', diff: { opportunity_id: opportunityId, from_status: current.status, to_status: status } })
    })
    revalidatePath(tenderPath(opportunityId))
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Tender status could not be changed.' }
  }
}

export async function addTenderDeviation(formData: FormData): Promise<{ error?: string }> {
  try {
    const profile = await requireUserProfile()
    const denied = forbid(profile.role, 'tender.manage')
    if (denied) return { error: denied }
    const opportunityId = parseUuid(formData.get('opportunityId'), 'Opportunity')
    const tenderId = parseUuid(formData.get('tenderId'), 'Tender')
    const category = z.enum(['scope', 'quantity', 'unit', 'exclusion', 'schedule', 'commercial']).parse(formData.get('category'))
    const title = parseText(formData.get('title'), 'Title', 255)
    const description = parseText(formData.get('description'), 'Description', 10000)
    const sourceReference = parseText(formData.get('sourceReference'), 'Source reference', 255, false)
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [tender] = await tx.select({ id: tenderPackages.id }).from(tenderPackages).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.opportunity_id, opportunityId), eq(tenderPackages.tenant_id, profile.tenantId))).limit(1).for('update')
      if (!tender) throw new Error('Tender not found')
      const [created] = await tx.insert(tenderDeviations).values({ tenant_id: profile.tenantId, tender_id: tenderId, category, title, description, source_reference: sourceReference, created_by: profile.user.id }).returning({ id: tenderDeviations.id })
      if (!created) throw new Error('Deviation could not be added.')
      await writeAuditLogInTransaction(tx, { tenantId: profile.tenantId, actorId: profile.user.id, entityType: 'tender_deviation', entityId: created.id, action: 'create', diff: { tender_id: tenderId, category } })
    })
    revalidatePath(tenderPath(opportunityId))
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Deviation could not be added.' }
  }
}

export async function addTenderCriterion(formData: FormData): Promise<{ error?: string }> {
  try {
    const profile = await requireUserProfile()
    const denied = forbid(profile.role, 'tender.manage')
    if (denied) return { error: denied }
    const opportunityId = parseUuid(formData.get('opportunityId'), 'Opportunity')
    const tenderId = parseUuid(formData.get('tenderId'), 'Tender')
    const name = parseText(formData.get('name'), 'Name', 160)
    const description = parseText(formData.get('description'), 'Description', 5000, false)
    const criterionType = z.enum(['price', 'technical', 'schedule', 'safety', 'experience', 'commercial', 'other']).parse(formData.get('criterionType'))
    const weightBps = z.coerce.number().int().min(1).max(10000).parse(formData.get('weightBps'))
    const isRequired = formData.get('isRequired') === 'on'
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [tender] = await tx.select({ id: tenderPackages.id }).from(tenderPackages).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.opportunity_id, opportunityId), eq(tenderPackages.tenant_id, profile.tenantId))).limit(1).for('update')
      if (!tender) throw new Error('Tender not found')
      const rows = await tx.select({ weight: tenderEvaluationCriteria.weight_bps }).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.tenant_id, profile.tenantId), eq(tenderEvaluationCriteria.tender_id, tenderId)))
      if (rows.reduce((sum, row) => sum + row.weight, weightBps) > 10000) throw new Error('Evaluation criteria weights cannot exceed 10000 bps.')
      const [created] = await tx.insert(tenderEvaluationCriteria).values({ tenant_id: profile.tenantId, tender_id: tenderId, name, description, criterion_type: criterionType, weight_bps: weightBps, is_required: isRequired, created_by: profile.user.id }).returning({ id: tenderEvaluationCriteria.id })
      if (!created) throw new Error('Criterion could not be added.')
      await writeAuditLogInTransaction(tx, { tenantId: profile.tenantId, actorId: profile.user.id, entityType: 'tender_evaluation_criterion', entityId: created.id, action: 'create', diff: { tender_id: tenderId, weight_bps: weightBps } })
    })
    revalidatePath(tenderPath(opportunityId))
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Criterion could not be added.' }
  }
}

export async function addTenderVendorProfile(formData: FormData): Promise<{ error?: string }> {
  try {
    const profile = await requireUserProfile()
    const denied = forbid(profile.role, 'tender.manage')
    if (denied) return { error: denied }
    const opportunityId = parseUuid(formData.get('opportunityId'), 'Opportunity')
    const tenderId = parseUuid(formData.get('tenderId'), 'Tender')
    const vendorId = parseUuid(formData.get('vendorId'), 'Vendor')
    const trade = parseText(formData.get('trade'), 'Trade', 120, false)
    const capabilitySummary = parseText(formData.get('capabilitySummary'), 'Capability summary', 10000, false)
    const [vendor] = await db.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.id, vendorId), eq(vendors.tenant_id, profile.tenantId))).limit(1)
    if (!vendor) return { error: 'Vendor not found.' }
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [tender] = await tx.select({ id: tenderPackages.id }).from(tenderPackages).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.opportunity_id, opportunityId), eq(tenderPackages.tenant_id, profile.tenantId))).limit(1).for('update')
      if (!tender) throw new Error('Tender not found')
      const [created] = await tx.insert(tenderVendorProfiles).values({ tenant_id: profile.tenantId, tender_id: tenderId, vendor_id: vendorId, trade, capability_summary: capabilitySummary, created_by: profile.user.id }).returning({ id: tenderVendorProfiles.id })
      if (!created) throw new Error('Vendor profile could not be added.')
      await writeAuditLogInTransaction(tx, { tenantId: profile.tenantId, actorId: profile.user.id, entityType: 'tender_vendor_profile', entityId: created.id, action: 'create', diff: { tender_id: tenderId, vendor_id: vendorId } })
    })
    revalidatePath(tenderPath(opportunityId))
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Vendor profile could not be added.' }
  }
}

export async function scoreTender(formData: FormData): Promise<{ error?: string }> {
  try {
    const profile = await requireUserProfile()
    const denied = forbid(profile.role, 'tender.evaluate')
    if (denied) return { error: denied }
    const opportunityId = parseUuid(formData.get('opportunityId'), 'Opportunity')
    const tenderId = parseUuid(formData.get('tenderId'), 'Tender')
    const vendorProfileId = parseUuid(formData.get('vendorProfileId'), 'Vendor profile')
    const criterionId = parseUuid(formData.get('criterionId'), 'Criterion')
    const scoreBps = z.coerce.number().int().min(0).max(10000).parse(formData.get('scoreBps'))
    const notes = parseText(formData.get('notes'), 'Notes', 10000, false)
    const expectedVersionRaw = formData.get('expectedVersion')?.toString().trim() ?? ''
    const expectedVersion = expectedVersionRaw === '' ? null : z.coerce.number().int().min(1).parse(expectedVersionRaw)
    await db.transaction(async (tx) => {
      await stampActorInTransaction(tx, profile.user.id)
      const [tender] = await tx.select({ id: tenderPackages.id }).from(tenderPackages).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.opportunity_id, opportunityId), eq(tenderPackages.tenant_id, profile.tenantId))).limit(1).for('update')
      if (!tender) throw new Error('Tender not found')
      const [vendorProfile] = await tx.select({ id: tenderVendorProfiles.id }).from(tenderVendorProfiles).where(and(eq(tenderVendorProfiles.id, vendorProfileId), eq(tenderVendorProfiles.tender_id, tenderId), eq(tenderVendorProfiles.tenant_id, profile.tenantId))).limit(1)
      if (!vendorProfile) throw new Error('Tender vendor profile not found')
      const [criterion] = await tx.select({ id: tenderEvaluationCriteria.id }).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.id, criterionId), eq(tenderEvaluationCriteria.tender_id, tenderId), eq(tenderEvaluationCriteria.tenant_id, profile.tenantId))).limit(1)
      if (!criterion) throw new Error('Tender criterion not found')
      const [existing] = await tx.select({ id: tenderEvaluationScores.id, version: tenderEvaluationScores.version }).from(tenderEvaluationScores).where(and(eq(tenderEvaluationScores.tenant_id, profile.tenantId), eq(tenderEvaluationScores.tender_id, tenderId), eq(tenderEvaluationScores.vendor_profile_id, vendorProfileId), eq(tenderEvaluationScores.criterion_id, criterionId))).limit(1).for('update')
      if (existing && existing.version !== expectedVersion) throw new Error('Evaluation score changed; refresh before trying again.')
      if (!existing && expectedVersion !== null) throw new Error('Evaluation score does not exist; refresh before trying again.')
      let scoreId: string
      if (existing) {
        const [updated] = await tx.update(tenderEvaluationScores).set({ score_bps: scoreBps, notes, reviewed_by: profile.user.id, reviewed_at: new Date(), version: existing.version + 1, updated_at: new Date() }).where(and(eq(tenderEvaluationScores.id, existing.id), eq(tenderEvaluationScores.tenant_id, profile.tenantId), eq(tenderEvaluationScores.version, existing.version))).returning({ id: tenderEvaluationScores.id })
        if (!updated) throw new Error('Score changed; refresh before trying again.')
        scoreId = updated.id
      } else {
        const [created] = await tx.insert(tenderEvaluationScores).values({ tenant_id: profile.tenantId, tender_id: tenderId, vendor_profile_id: vendorProfileId, criterion_id: criterionId, score_bps: scoreBps, notes, reviewed_by: profile.user.id, reviewed_at: new Date() }).returning({ id: tenderEvaluationScores.id })
        if (!created) throw new Error('Score could not be saved.')
        scoreId = created.id
      }
      await writeAuditLogInTransaction(tx, { tenantId: profile.tenantId, actorId: profile.user.id, entityType: 'tender_evaluation_score', entityId: scoreId, action: existing ? 'update' : 'create', diff: { tender_id: tenderId, vendor_profile_id: vendorProfileId, criterion_id: criterionId, score_bps: scoreBps } })
    })
    revalidatePath(tenderPath(opportunityId))
    return {}
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Score could not be saved.' }
  }
}
