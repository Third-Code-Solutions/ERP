import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  boms,
  documents,
  opportunities,
  tenderDeviations,
  tenderEvaluationCriteria,
  tenderEvaluationScores,
  tenderPackages,
  tenderVendorProfiles,
  vendors,
  users,
} from '@third-code-erp/database/schema'
import {
  bindTenderBomCommandSchema,
  createOpportunityTenderCommandSchema,
  createTenderCriterionCommandSchema,
  createTenderDeviationCommandSchema,
  createTenderVendorProfileCommandSchema,
  opportunityTenderDetailResultSchema,
  opportunityTenderMutationResultSchema,
  tenderEvaluationScoreRowSchema,
  tenderEvaluationSummaryRowSchema,
  tenderCriterionRowSchema,
  tenderDeviationRowSchema,
  tenderNestedMutationResultSchema,
  tenderStatusCommandSchema,
  tenderVendorProfileRowSchema,
  updateOpportunityTenderCommandSchema,
  updateTenderCriterionCommandSchema,
  updateTenderDeviationCommandSchema,
  updateTenderVendorProfileCommandSchema,
  upsertTenderEvaluationScoreCommandSchema,
  type BindTenderBomCommand,
  type CreateOpportunityTenderCommand,
  type CreateTenderCriterionCommand,
  type CreateTenderDeviationCommand,
  type CreateTenderVendorProfileCommand,
  type ErpRole,
  type OpportunityTenderDetailResult,
  type OpportunityTenderMutationResult,
  type TenderStatusCommand,
  type UpdateOpportunityTenderCommand,
  type UpdateTenderCriterionCommand,
  type UpdateTenderDeviationCommand,
  type UpdateTenderVendorProfileCommand,
  type UpsertTenderEvaluationScoreCommand,
} from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability, type ErpCapability } from '@third-code-erp/shared-types/authorization'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const tenderSelection = {
  id: tenderPackages.id,
  opportunityId: tenderPackages.opportunity_id,
  title: tenderPackages.title,
  reference: tenderPackages.reference,
  sourceMode: tenderPackages.source_mode,
  status: tenderPackages.status,
  torDocumentId: tenderPackages.tor_document_id,
  boqDocumentId: tenderPackages.boq_document_id,
  boundBomId: tenderPackages.bound_bom_id,
  closingAt: tenderPackages.closing_at,
  submittedAt: tenderPackages.submitted_at,
  version: tenderPackages.version,
  createdBy: tenderPackages.created_by,
  createdAt: tenderPackages.created_at,
  updatedAt: tenderPackages.updated_at,
}

type TenderDbRow = {
  id: string
  opportunityId: string
  title: string
  reference: string
  sourceMode: 'client_issued_boq' | 'abi_generated_bom'
  status: 'draft' | 'open' | 'evaluating' | 'submitted' | 'closed'
  torDocumentId: string | null
  boqDocumentId: string | null
  boundBomId: string | null
  closingAt: Date | null
  submittedAt: Date | null
  version: number
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

const deviationSelection = {
  id: tenderDeviations.id,
  tenderId: tenderDeviations.tender_id,
  category: tenderDeviations.category,
  title: tenderDeviations.title,
  description: tenderDeviations.description,
  sourceReference: tenderDeviations.source_reference,
  response: tenderDeviations.response,
  ownerId: tenderDeviations.owner_id,
  status: tenderDeviations.status,
  version: tenderDeviations.version,
  createdAt: tenderDeviations.created_at,
  updatedAt: tenderDeviations.updated_at,
}

type DeviationDbRow = {
  id: string
  tenderId: string
  category: 'scope' | 'quantity' | 'unit' | 'exclusion' | 'schedule' | 'commercial'
  title: string
  description: string
  sourceReference: string
  response: string
  ownerId: string | null
  status: 'open' | 'responded' | 'accepted' | 'rejected'
  version: number
  createdAt: Date
  updatedAt: Date
}

const criterionSelection = {
  id: tenderEvaluationCriteria.id,
  tenderId: tenderEvaluationCriteria.tender_id,
  name: tenderEvaluationCriteria.name,
  description: tenderEvaluationCriteria.description,
  criterionType: tenderEvaluationCriteria.criterion_type,
  weightBps: tenderEvaluationCriteria.weight_bps,
  isRequired: tenderEvaluationCriteria.is_required,
  sortOrder: tenderEvaluationCriteria.sort_order,
  version: tenderEvaluationCriteria.version,
  createdAt: tenderEvaluationCriteria.created_at,
  updatedAt: tenderEvaluationCriteria.updated_at,
}

type CriterionDbRow = {
  id: string
  tenderId: string
  name: string
  description: string
  criterionType: 'price' | 'technical' | 'schedule' | 'safety' | 'experience' | 'commercial' | 'other'
  weightBps: number
  isRequired: boolean
  sortOrder: number
  version: number
  createdAt: Date
  updatedAt: Date
}

const profileSelection = {
  id: tenderVendorProfiles.id,
  tenderId: tenderVendorProfiles.tender_id,
  vendorId: tenderVendorProfiles.vendor_id,
  vendorName: vendors.name,
  trade: tenderVendorProfiles.trade,
  capabilitySummary: tenderVendorProfiles.capability_summary,
  qualificationSummary: tenderVendorProfiles.qualification_summary,
  availabilityNotes: tenderVendorProfiles.availability_notes,
  complianceNotes: tenderVendorProfiles.compliance_notes,
  status: tenderVendorProfiles.status,
  version: tenderVendorProfiles.version,
  createdAt: tenderVendorProfiles.created_at,
  updatedAt: tenderVendorProfiles.updated_at,
}

type ProfileDbRow = {
  id: string
  tenderId: string
  vendorId: string
  vendorName: string
  trade: string
  capabilitySummary: string
  qualificationSummary: string
  availabilityNotes: string
  complianceNotes: string
  status: 'draft' | 'reviewing' | 'qualified' | 'declined'
  version: number
  createdAt: Date
  updatedAt: Date
}

const scoreSelection = {
  id: tenderEvaluationScores.id,
  tenderId: tenderEvaluationScores.tender_id,
  vendorProfileId: tenderEvaluationScores.vendor_profile_id,
  criterionId: tenderEvaluationScores.criterion_id,
  scoreBps: tenderEvaluationScores.score_bps,
  notes: tenderEvaluationScores.notes,
  reviewedBy: tenderEvaluationScores.reviewed_by,
  reviewedAt: tenderEvaluationScores.reviewed_at,
  version: tenderEvaluationScores.version,
  updatedAt: tenderEvaluationScores.updated_at,
}

type ScoreDbRow = {
  id: string
  tenderId: string
  vendorProfileId: string
  criterionId: string
  scoreBps: number
  notes: string
  reviewedBy: string | null
  reviewedAt: Date | null
  version: number
  updatedAt: Date
}

function serializeTender(row: TenderDbRow) {
  return {
    id: row.id,
    opportunityId: row.opportunityId,
    title: row.title,
    reference: row.reference,
    sourceMode: row.sourceMode,
    status: row.status,
    torDocumentId: row.torDocumentId,
    boqDocumentId: row.boqDocumentId,
    boundBomId: row.boundBomId,
    closingAt: row.closingAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function serializeDeviation(row: DeviationDbRow) {
  return tenderDeviationRowSchema.parse({
    id: row.id,
    tenderId: row.tenderId,
    category: row.category,
    title: row.title,
    description: row.description,
    sourceReference: row.sourceReference,
    response: row.response,
    ownerId: row.ownerId,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function serializeCriterion(row: CriterionDbRow) {
  return tenderCriterionRowSchema.parse({
    id: row.id,
    tenderId: row.tenderId,
    name: row.name,
    description: row.description,
    criterionType: row.criterionType,
    weightBps: row.weightBps,
    isRequired: row.isRequired,
    sortOrder: row.sortOrder,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function serializeProfile(row: ProfileDbRow) {
  return tenderVendorProfileRowSchema.parse({
    id: row.id,
    tenderId: row.tenderId,
    vendorId: row.vendorId,
    vendorName: row.vendorName,
    trade: row.trade,
    capabilitySummary: row.capabilitySummary,
    qualificationSummary: row.qualificationSummary,
    availabilityNotes: row.availabilityNotes,
    complianceNotes: row.complianceNotes,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

function serializeScore(row: ScoreDbRow) {
  return tenderEvaluationScoreRowSchema.parse({
    id: row.id,
    tenderId: row.tenderId,
    vendorProfileId: row.vendorProfileId,
    criterionId: row.criterionId,
    scoreBps: row.scoreBps,
    notes: row.notes,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  })
}

const allowedStatusTransitions: Record<TenderDbRow['status'], readonly TenderDbRow['status'][]> = {
  draft: ['open', 'closed'],
  open: ['evaluating', 'closed'],
  evaluating: ['submitted', 'closed'],
  submitted: ['closed'],
  closed: [],
}

@Injectable()
export class TendersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async detail(opportunityId: string, principal: ErpPrincipal): Promise<OpportunityTenderDetailResult> {
    await this.requireMembership(principal, 'tender.read')
    const rows = await this.database.client
      .select(tenderSelection)
      .from(tenderPackages)
      .innerJoin(opportunities, and(eq(opportunities.id, tenderPackages.opportunity_id), eq(opportunities.tenant_id, principal.tenantId)))
      .where(and(eq(tenderPackages.opportunity_id, opportunityId), eq(tenderPackages.tenant_id, principal.tenantId)))
      .orderBy(desc(tenderPackages.created_at), desc(tenderPackages.id))
      .limit(1)
    const opportunity = await this.database.client
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, principal.tenantId)))
      .limit(1)
    if (!opportunity[0]) throw new NotFoundException('Opportunity not found')
    const tender = rows[0] as TenderDbRow | undefined
    if (!tender) return opportunityTenderDetailResultSchema.parse({ opportunityId, tender: null, deviations: [], criteria: [], vendorProfiles: [], scores: [], evaluationSummary: [] })

    const [deviations, criteria, profiles, scores] = await Promise.all([
      this.database.client.select(deviationSelection).from(tenderDeviations).where(and(eq(tenderDeviations.tenant_id, principal.tenantId), eq(tenderDeviations.tender_id, tender.id))).orderBy(asc(tenderDeviations.created_at)),
      this.database.client.select(criterionSelection).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.tenant_id, principal.tenantId), eq(tenderEvaluationCriteria.tender_id, tender.id))).orderBy(asc(tenderEvaluationCriteria.sort_order), asc(tenderEvaluationCriteria.created_at)),
      this.database.client.select(profileSelection).from(tenderVendorProfiles).innerJoin(vendors, and(eq(vendors.id, tenderVendorProfiles.vendor_id), eq(vendors.tenant_id, principal.tenantId))).where(and(eq(tenderVendorProfiles.tenant_id, principal.tenantId), eq(tenderVendorProfiles.tender_id, tender.id))).orderBy(asc(vendors.name)),
      this.database.client.select(scoreSelection).from(tenderEvaluationScores).where(and(eq(tenderEvaluationScores.tenant_id, principal.tenantId), eq(tenderEvaluationScores.tender_id, tender.id))).orderBy(asc(tenderEvaluationScores.updated_at)),
    ])
    const serializedCriteria = criteria.map((row) => serializeCriterion(row as CriterionDbRow))
    const serializedProfiles = profiles.map((row) => serializeProfile(row as ProfileDbRow))
    const serializedScores = scores.map((row) => serializeScore(row as ScoreDbRow))
    const criteriaById = new Map(serializedCriteria.map((criterion) => [criterion.id, criterion]))
    const scoresByProfile = new Map<string, typeof serializedScores>()
    for (const score of serializedScores) {
      const bucket = scoresByProfile.get(score.vendorProfileId) ?? []
      bucket.push(score)
      scoresByProfile.set(score.vendorProfileId, bucket)
    }
    const evaluationSummary = serializedProfiles.map((profile) => {
      const profileScores = scoresByProfile.get(profile.id) ?? []
      const weightedScoreBps = profileScores.reduce((total, score) => {
        const criterion = criteriaById.get(score.criterionId)
        return criterion ? total + Math.floor((score.scoreBps * criterion.weightBps) / 10_000) : total
      }, 0)
      return tenderEvaluationSummaryRowSchema.parse({
        vendorProfileId: profile.id,
        vendorName: profile.vendorName,
        weightedScoreBps: Math.min(10_000, weightedScoreBps),
        scoredCriteria: profileScores.length,
        criteriaCount: serializedCriteria.length,
        complete: serializedCriteria.length > 0 && profileScores.length >= serializedCriteria.length,
      })
    })
    return opportunityTenderDetailResultSchema.parse({
      opportunityId,
      tender: serializeTender(tender),
      deviations: deviations.map((row) => serializeDeviation(row as DeviationDbRow)),
      criteria: serializedCriteria,
      vendorProfiles: serializedProfiles,
      scores: serializedScores,
      evaluationSummary,
    })
  }

  async create(command: CreateOpportunityTenderCommand, principal: ErpPrincipal): Promise<OpportunityTenderMutationResult> {
    const input = createOpportunityTenderCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'tender-create:' + actor.tenantId + ':' + input.clientRequestId}, 0))`)
      const [opportunity] = await transaction.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.tenant_id, actor.tenantId))).limit(1).for('update')
      if (!opportunity) throw new NotFoundException('Opportunity not found')
      const [existing] = await transaction.select(tenderSelection).from(tenderPackages).where(and(eq(tenderPackages.tenant_id, actor.tenantId), eq(tenderPackages.client_request_id, input.clientRequestId))).limit(1).for('update')
      if (existing) {
        const row = existing as TenderDbRow
        if (row.opportunityId !== input.opportunityId || row.title !== input.title || row.reference !== input.reference || row.sourceMode !== input.sourceMode || row.torDocumentId !== input.torDocumentId || row.boqDocumentId !== input.boqDocumentId || (row.closingAt?.toISOString() ?? null) !== input.closingAt) throw new ConflictException('Client request id was already used for a different tender')
        return opportunityTenderMutationResultSchema.parse({ opportunityId: input.opportunityId, changed: false, tender: serializeTender(row) })
      }
      await this.assertOpportunityDocument(transaction, actor.tenantId, input.opportunityId, input.torDocumentId, 'TOR')
      await this.assertOpportunityDocument(transaction, actor.tenantId, input.opportunityId, input.boqDocumentId, 'BOQ')
      const [inserted] = await transaction.insert(tenderPackages).values({ tenant_id: actor.tenantId, opportunity_id: input.opportunityId, title: input.title, reference: input.reference, source_mode: input.sourceMode, tor_document_id: input.torDocumentId, boq_document_id: input.boqDocumentId, closing_at: input.closingAt ? new Date(input.closingAt) : null, client_request_id: input.clientRequestId, created_by: actor.userId }).returning(tenderSelection)
      if (!inserted) throw new InternalServerErrorException('Tender insert returned no record')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_package', entityId: inserted.id, action: 'create', diff: { opportunity_id: input.opportunityId, source_mode: input.sourceMode, reference: input.reference } })
      return opportunityTenderMutationResultSchema.parse({ opportunityId: input.opportunityId, changed: true, tender: serializeTender(inserted as TenderDbRow) })
    })
  }

  async update(opportunityId: string, tenderId: string, command: UpdateOpportunityTenderCommand, principal: ErpPrincipal): Promise<OpportunityTenderMutationResult> {
    const input = updateOpportunityTenderCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      const current = await this.lockTender(transaction, actor.tenantId, opportunityId, tenderId)
      if (current.version !== input.expectedVersion) throw new ConflictException('Tender changed; refresh before trying again')
      if (!['draft', 'open'].includes(current.status)) throw new ConflictException('Only draft or open tenders can be edited')
      await this.assertOpportunityDocument(transaction, actor.tenantId, opportunityId, input.torDocumentId, 'TOR')
      await this.assertOpportunityDocument(transaction, actor.tenantId, opportunityId, input.boqDocumentId, 'BOQ')
      const [updated] = await transaction.update(tenderPackages).set({ title: input.title, reference: input.reference, source_mode: input.sourceMode, tor_document_id: input.torDocumentId, boq_document_id: input.boqDocumentId, closing_at: input.closingAt ? new Date(input.closingAt) : null, version: current.version + 1, updated_at: new Date() }).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.tenant_id, actor.tenantId), eq(tenderPackages.version, current.version))).returning(tenderSelection)
      if (!updated) throw new ConflictException('Tender changed; refresh before trying again')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_package', entityId: tenderId, action: 'update', diff: { opportunity_id: opportunityId, version: { before: current.version, after: current.version + 1 } } })
      return opportunityTenderMutationResultSchema.parse({ opportunityId, changed: true, tender: serializeTender(updated as TenderDbRow) })
    })
  }

  async transition(opportunityId: string, tenderId: string, command: TenderStatusCommand, principal: ErpPrincipal): Promise<OpportunityTenderMutationResult> {
    const input = tenderStatusCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, input.status === 'submitted' ? 'tender.evaluate' : 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      const current = await this.lockTender(transaction, actor.tenantId, opportunityId, tenderId)
      if (current.version !== input.expectedVersion) throw new ConflictException('Tender changed; refresh before trying again')
      if (current.status === input.status) return opportunityTenderMutationResultSchema.parse({ opportunityId, changed: false, tender: serializeTender(current) })
      if (!allowedStatusTransitions[current.status].includes(input.status)) throw new ConflictException(`Cannot transition ${current.status} → ${input.status}`)
      if (input.status === 'submitted') await this.assertEvaluationReady(transaction, actor.tenantId, tenderId)
      const [updated] = await transaction.update(tenderPackages).set({ status: input.status, submitted_at: input.status === 'submitted' ? new Date() : current.submittedAt, version: current.version + 1, updated_at: new Date() }).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.tenant_id, actor.tenantId), eq(tenderPackages.version, current.version))).returning(tenderSelection)
      if (!updated) throw new ConflictException('Tender changed; refresh before trying again')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_package', entityId: tenderId, action: 'status_change', diff: { opportunity_id: opportunityId, from_status: current.status, to_status: input.status } })
      return opportunityTenderMutationResultSchema.parse({ opportunityId, changed: true, tender: serializeTender(updated as TenderDbRow) })
    })
  }

  async bindBom(opportunityId: string, tenderId: string, command: BindTenderBomCommand, principal: ErpPrincipal): Promise<OpportunityTenderMutationResult> {
    const input = bindTenderBomCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      const current = await this.lockTender(transaction, actor.tenantId, opportunityId, tenderId)
      if (current.version !== input.expectedVersion) throw new ConflictException('Tender changed; refresh before trying again')
      if (input.bomId) {
        const [bom] = await transaction.select({ id: boms.id, opportunityId: boms.opportunity_id }).from(boms).where(and(eq(boms.id, input.bomId), eq(boms.tenant_id, actor.tenantId))).limit(1)
        if (!bom || bom.opportunityId !== opportunityId) throw new NotFoundException('BOM not found for this opportunity')
      }
      const [updated] = await transaction.update(tenderPackages).set({ bound_bom_id: input.bomId, version: current.version + 1, updated_at: new Date() }).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.tenant_id, actor.tenantId), eq(tenderPackages.version, current.version))).returning(tenderSelection)
      if (!updated) throw new ConflictException('Tender changed; refresh before trying again')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_package', entityId: tenderId, action: 'update', diff: { opportunity_id: opportunityId, bound_bom_id: { before: current.boundBomId, after: input.bomId } } })
      return opportunityTenderMutationResultSchema.parse({ opportunityId, changed: true, tender: serializeTender(updated as TenderDbRow) })
    })
  }

  async createDeviation(opportunityId: string, tenderId: string, command: CreateTenderDeviationCommand, principal: ErpPrincipal) {
    const input = createTenderDeviationCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      await this.requireTender(transaction, actor.tenantId, opportunityId, tenderId)
      await this.assertUser(transaction, actor.tenantId, input.ownerId)
      const [created] = await transaction.insert(tenderDeviations).values({ tenant_id: actor.tenantId, tender_id: tenderId, category: input.category, title: input.title, description: input.description, source_reference: input.sourceReference, owner_id: input.ownerId, created_by: actor.userId }).returning(deviationSelection)
      if (!created) throw new InternalServerErrorException('Deviation insert returned no record')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_deviation', entityId: created.id, action: 'create', diff: { tender_id: tenderId, category: input.category } })
      return tenderNestedMutationResultSchema.parse({ tenderId, changed: true, row: serializeDeviation(created as DeviationDbRow) })
    })
  }

  async updateDeviation(opportunityId: string, tenderId: string, deviationId: string, command: UpdateTenderDeviationCommand, principal: ErpPrincipal) {
    const input = updateTenderDeviationCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      await this.requireTender(transaction, actor.tenantId, opportunityId, tenderId)
      await this.assertUser(transaction, actor.tenantId, input.ownerId)
      const [current] = await transaction.select(deviationSelection).from(tenderDeviations).where(and(eq(tenderDeviations.id, deviationId), eq(tenderDeviations.tender_id, tenderId), eq(tenderDeviations.tenant_id, actor.tenantId))).limit(1).for('update')
      if (!current) throw new NotFoundException('Tender deviation not found')
      const row = current as DeviationDbRow
      if (row.version !== input.expectedVersion) throw new ConflictException('Deviation changed; refresh before trying again')
      const [updated] = await transaction.update(tenderDeviations).set({ category: input.category, title: input.title, description: input.description, source_reference: input.sourceReference, response: input.response, owner_id: input.ownerId, status: input.status, version: row.version + 1, updated_at: new Date() }).where(and(eq(tenderDeviations.id, deviationId), eq(tenderDeviations.tenant_id, actor.tenantId), eq(tenderDeviations.version, row.version))).returning(deviationSelection)
      if (!updated) throw new ConflictException('Deviation changed; refresh before trying again')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_deviation', entityId: deviationId, action: 'update', diff: { tender_id: tenderId, from_status: row.status, to_status: input.status } })
      return tenderNestedMutationResultSchema.parse({ tenderId, changed: true, row: serializeDeviation(updated as DeviationDbRow) })
    })
  }

  async createCriterion(opportunityId: string, tenderId: string, command: CreateTenderCriterionCommand, principal: ErpPrincipal) {
    const input = createTenderCriterionCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      await this.lockTender(transaction, actor.tenantId, opportunityId, tenderId)
      await this.assertCriteriaWeight(transaction, actor.tenantId, tenderId, input.weightBps)
      const [created] = await transaction.insert(tenderEvaluationCriteria).values({ tenant_id: actor.tenantId, tender_id: tenderId, name: input.name, description: input.description, criterion_type: input.criterionType, weight_bps: input.weightBps, is_required: input.isRequired, sort_order: input.sortOrder, created_by: actor.userId }).returning(criterionSelection)
      if (!created) throw new InternalServerErrorException('Criterion insert returned no record')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_evaluation_criterion', entityId: created.id, action: 'create', diff: { tender_id: tenderId, weight_bps: input.weightBps } })
      return tenderNestedMutationResultSchema.parse({ tenderId, changed: true, row: serializeCriterion(created as CriterionDbRow) })
    })
  }

  async updateCriterion(opportunityId: string, tenderId: string, criterionId: string, command: UpdateTenderCriterionCommand, principal: ErpPrincipal) {
    const input = updateTenderCriterionCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      await this.lockTender(transaction, actor.tenantId, opportunityId, tenderId)
      const [current] = await transaction.select(criterionSelection).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.id, criterionId), eq(tenderEvaluationCriteria.tender_id, tenderId), eq(tenderEvaluationCriteria.tenant_id, actor.tenantId))).limit(1).for('update')
      if (!current) throw new NotFoundException('Tender criterion not found')
      const row = current as CriterionDbRow
      if (row.version !== input.expectedVersion) throw new ConflictException('Criterion changed; refresh before trying again')
      await this.assertCriteriaWeight(transaction, actor.tenantId, tenderId, input.weightBps, criterionId)
      const [updated] = await transaction.update(tenderEvaluationCriteria).set({ name: input.name, description: input.description, criterion_type: input.criterionType, weight_bps: input.weightBps, is_required: input.isRequired, sort_order: input.sortOrder, version: row.version + 1, updated_at: new Date() }).where(and(eq(tenderEvaluationCriteria.id, criterionId), eq(tenderEvaluationCriteria.tenant_id, actor.tenantId), eq(tenderEvaluationCriteria.version, row.version))).returning(criterionSelection)
      if (!updated) throw new ConflictException('Criterion changed; refresh before trying again')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_evaluation_criterion', entityId: criterionId, action: 'update', diff: { tender_id: tenderId, weight_bps: { before: row.weightBps, after: input.weightBps } } })
      return tenderNestedMutationResultSchema.parse({ tenderId, changed: true, row: serializeCriterion(updated as CriterionDbRow) })
    })
  }

  async createVendorProfile(opportunityId: string, tenderId: string, command: CreateTenderVendorProfileCommand, principal: ErpPrincipal) {
    const input = createTenderVendorProfileCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      await this.requireTender(transaction, actor.tenantId, opportunityId, tenderId)
      await this.assertVendor(transaction, actor.tenantId, input.vendorId)
      const [created] = await transaction.insert(tenderVendorProfiles).values({ tenant_id: actor.tenantId, tender_id: tenderId, vendor_id: input.vendorId, trade: input.trade, capability_summary: input.capabilitySummary, qualification_summary: input.qualificationSummary, availability_notes: input.availabilityNotes, compliance_notes: input.complianceNotes, created_by: actor.userId }).returning({ id: tenderVendorProfiles.id })
      if (!created) throw new InternalServerErrorException('Vendor profile insert returned no record')
      const row = await this.profileById(transaction, actor.tenantId, tenderId, created.id)
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_vendor_profile', entityId: created.id, action: 'create', diff: { tender_id: tenderId, vendor_id: input.vendorId } })
      return tenderNestedMutationResultSchema.parse({ tenderId, changed: true, row: serializeProfile(row) })
    })
  }

  async updateVendorProfile(opportunityId: string, tenderId: string, profileId: string, command: UpdateTenderVendorProfileCommand, principal: ErpPrincipal) {
    const input = updateTenderVendorProfileCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.manage')
      await this.audit.stampActor(transaction, actor)
      await this.requireTender(transaction, actor.tenantId, opportunityId, tenderId)
      const [current] = await transaction.select({ id: tenderVendorProfiles.id, version: tenderVendorProfiles.version }).from(tenderVendorProfiles).where(and(eq(tenderVendorProfiles.id, profileId), eq(tenderVendorProfiles.tender_id, tenderId), eq(tenderVendorProfiles.tenant_id, actor.tenantId))).limit(1).for('update')
      if (!current) throw new NotFoundException('Tender vendor profile not found')
      if (current.version !== input.expectedVersion) throw new ConflictException('Vendor profile changed; refresh before trying again')
      const [updated] = await transaction.update(tenderVendorProfiles).set({ trade: input.trade, capability_summary: input.capabilitySummary, qualification_summary: input.qualificationSummary, availability_notes: input.availabilityNotes, compliance_notes: input.complianceNotes, status: input.status, version: current.version + 1, updated_at: new Date() }).where(and(eq(tenderVendorProfiles.id, profileId), eq(tenderVendorProfiles.tenant_id, actor.tenantId), eq(tenderVendorProfiles.version, current.version))).returning({ id: tenderVendorProfiles.id })
      if (!updated) throw new ConflictException('Vendor profile changed; refresh before trying again')
      const row = await this.profileById(transaction, actor.tenantId, tenderId, profileId)
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_vendor_profile', entityId: profileId, action: 'update', diff: { tender_id: tenderId, status: input.status } })
      return tenderNestedMutationResultSchema.parse({ tenderId, changed: true, row: serializeProfile(row) })
    })
  }

  async upsertScore(opportunityId: string, tenderId: string, command: UpsertTenderEvaluationScoreCommand, principal: ErpPrincipal) {
    const input = upsertTenderEvaluationScoreCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.requireMembershipOn(transaction, principal, 'tender.evaluate')
      await this.audit.stampActor(transaction, actor)
      await this.lockTender(transaction, actor.tenantId, opportunityId, tenderId)
      const [profile] = await transaction.select({ id: tenderVendorProfiles.id }).from(tenderVendorProfiles).where(and(eq(tenderVendorProfiles.id, input.vendorProfileId), eq(tenderVendorProfiles.tender_id, tenderId), eq(tenderVendorProfiles.tenant_id, actor.tenantId))).limit(1)
      if (!profile) throw new NotFoundException('Tender vendor profile not found')
      const [criterion] = await transaction.select({ id: tenderEvaluationCriteria.id }).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.id, input.criterionId), eq(tenderEvaluationCriteria.tender_id, tenderId), eq(tenderEvaluationCriteria.tenant_id, actor.tenantId))).limit(1)
      if (!criterion) throw new NotFoundException('Tender criterion not found')
      const [current] = await transaction.select(scoreSelection).from(tenderEvaluationScores).where(and(eq(tenderEvaluationScores.vendor_profile_id, input.vendorProfileId), eq(tenderEvaluationScores.criterion_id, input.criterionId), eq(tenderEvaluationScores.tender_id, tenderId), eq(tenderEvaluationScores.tenant_id, actor.tenantId))).limit(1).for('update')
      if (current && current.version !== input.expectedVersion) throw new ConflictException('Evaluation score changed; refresh before trying again')
      if (!current && input.expectedVersion !== null) throw new ConflictException('Evaluation score does not exist')
      const now = new Date()
      const row = current as ScoreDbRow | undefined
      let saved: ScoreDbRow | undefined
      if (row) {
        const [updated] = await transaction.update(tenderEvaluationScores).set({ score_bps: input.scoreBps, notes: input.notes, reviewed_by: actor.userId, reviewed_at: now, version: row.version + 1, updated_at: now }).where(and(eq(tenderEvaluationScores.id, row.id), eq(tenderEvaluationScores.tenant_id, actor.tenantId), eq(tenderEvaluationScores.version, row.version))).returning(scoreSelection)
        saved = updated as ScoreDbRow | undefined
      } else {
        const [created] = await transaction.insert(tenderEvaluationScores).values({ tenant_id: actor.tenantId, tender_id: tenderId, vendor_profile_id: input.vendorProfileId, criterion_id: input.criterionId, score_bps: input.scoreBps, notes: input.notes, reviewed_by: actor.userId, reviewed_at: now }).returning(scoreSelection)
        saved = created as ScoreDbRow | undefined
      }
      if (!saved) throw new ConflictException('Evaluation score changed; refresh before trying again')
      await this.audit.writeSemantic(transaction, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'tender_evaluation_score', entityId: saved.id, action: row ? 'update' : 'create', diff: { tender_id: tenderId, vendor_profile_id: input.vendorProfileId, criterion_id: input.criterionId, score_bps: input.scoreBps } })
      return tenderNestedMutationResultSchema.parse({ tenderId, changed: true, row: serializeScore(saved) })
    })
  }

  private async assertEvaluationReady(transaction: DatabaseTransaction, tenantId: string, tenderId: string): Promise<void> {
    const [criteria, profiles, scores] = await Promise.all([
      transaction.select({ id: tenderEvaluationCriteria.id, isRequired: tenderEvaluationCriteria.is_required }).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.tenant_id, tenantId), eq(tenderEvaluationCriteria.tender_id, tenderId))),
      transaction.select({ id: tenderVendorProfiles.id }).from(tenderVendorProfiles).where(and(eq(tenderVendorProfiles.tenant_id, tenantId), eq(tenderVendorProfiles.tender_id, tenderId))),
      transaction.select({ vendorProfileId: tenderEvaluationScores.vendor_profile_id, criterionId: tenderEvaluationScores.criterion_id }).from(tenderEvaluationScores).where(and(eq(tenderEvaluationScores.tenant_id, tenantId), eq(tenderEvaluationScores.tender_id, tenderId))),
    ])
    if (profiles.length === 0) throw new ConflictException('Add at least one vendor profile before submission')
    const required = criteria.filter((criterion) => criterion.isRequired)
    for (const profile of profiles) {
      const profileScores = scores.filter((score) => score.vendorProfileId === profile.id)
      if (required.some((criterion) => !profileScores.some((score) => score.criterionId === criterion.id))) throw new ConflictException('Every vendor profile needs a score for each required criterion')
    }
  }

  private async assertCriteriaWeight(transaction: DatabaseTransaction, tenantId: string, tenderId: string, weightBps: number, replacingId?: string): Promise<void> {
    const rows = await transaction.select({ weightBps: tenderEvaluationCriteria.weight_bps, id: tenderEvaluationCriteria.id }).from(tenderEvaluationCriteria).where(and(eq(tenderEvaluationCriteria.tenant_id, tenantId), eq(tenderEvaluationCriteria.tender_id, tenderId)))
    const total = rows.reduce((sum, row) => sum + (row.id === replacingId ? 0 : row.weightBps), weightBps)
    if (total > 10_000) throw new ConflictException('Evaluation criteria weights cannot exceed 10000 bps')
  }

  private async assertOpportunityDocument(transaction: DatabaseTransaction, tenantId: string, opportunityId: string, documentId: string | null, label: string): Promise<void> {
    if (!documentId) return
    const [document] = await transaction.select({ id: documents.id }).from(documents).where(and(eq(documents.id, documentId), eq(documents.tenant_id, tenantId), eq(documents.opportunity_id, opportunityId))).limit(1)
    if (!document) throw new NotFoundException(`${label} document not found for this opportunity`)
  }

  private async assertUser(transaction: DatabaseTransaction, tenantId: string, userId: string | null): Promise<void> {
    if (!userId) return
    const [user] = await transaction.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.tenant_id, tenantId))).limit(1)
    if (!user) throw new NotFoundException('Tender owner not found')
  }

  private async assertVendor(transaction: DatabaseTransaction, tenantId: string, vendorId: string): Promise<void> {
    const [vendor] = await transaction.select({ id: vendors.id }).from(vendors).where(and(eq(vendors.id, vendorId), eq(vendors.tenant_id, tenantId))).limit(1)
    if (!vendor) throw new NotFoundException('Vendor not found')
  }

  private async profileById(transaction: DatabaseTransaction, tenantId: string, tenderId: string, profileId: string): Promise<ProfileDbRow> {
    const [row] = await transaction.select(profileSelection).from(tenderVendorProfiles).innerJoin(vendors, and(eq(vendors.id, tenderVendorProfiles.vendor_id), eq(vendors.tenant_id, tenantId))).where(and(eq(tenderVendorProfiles.id, profileId), eq(tenderVendorProfiles.tenant_id, tenantId), eq(tenderVendorProfiles.tender_id, tenderId))).limit(1)
    if (!row) throw new NotFoundException('Tender vendor profile not found')
    return row as ProfileDbRow
  }

  private async requireTender(transaction: DatabaseTransaction, tenantId: string, opportunityId: string, tenderId: string): Promise<TenderDbRow> {
    const [row] = await transaction.select(tenderSelection).from(tenderPackages).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.opportunity_id, opportunityId), eq(tenderPackages.tenant_id, tenantId))).limit(1).for('share')
    if (!row) throw new NotFoundException('Tender not found')
    return row as TenderDbRow
  }

  private async lockTender(transaction: DatabaseTransaction, tenantId: string, opportunityId: string, tenderId: string): Promise<TenderDbRow> {
    const [row] = await transaction.select(tenderSelection).from(tenderPackages).where(and(eq(tenderPackages.id, tenderId), eq(tenderPackages.opportunity_id, opportunityId), eq(tenderPackages.tenant_id, tenantId))).limit(1).for('update')
    if (!row) throw new NotFoundException('Tender not found')
    return row as TenderDbRow
  }

  private async requireMembership(principal: ErpPrincipal, capability: ErpCapability): Promise<ErpPrincipal> {
    return this.requireMembershipOn(this.database.client, principal, capability)
  }

  private async requireMembershipOn(client: DatabaseService['client'] | DatabaseTransaction, principal: ErpPrincipal, capability: ErpCapability): Promise<ErpPrincipal> {
    const [membership] = await client.select({ tenantId: users.tenant_id, role: users.role, email: users.email }).from(users).where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))).limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!membership || !role.success || !roleHasCapability(role.data, capability)) throw new ForbiddenException()
    return { userId: principal.userId, tenantId: membership.tenantId, role: role.data as ErpRole, email: membership.email }
  }
}
