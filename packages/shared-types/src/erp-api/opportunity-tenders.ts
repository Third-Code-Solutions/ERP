import { z } from 'zod'

const isoDateTime = z.string().datetime({ offset: true })
const nonEmptyText = (max: number) => z.string().trim().min(1).max(max)
const boundedText = (max: number) => z.string().trim().max(max).default('')

export const tenderPackageStatusSchema = z.enum(['draft', 'open', 'evaluating', 'submitted', 'closed'])
export const tenderSourceModeSchema = z.enum(['client_issued_boq', 'abi_generated_bom'])
export const tenderDeviationCategorySchema = z.enum(['scope', 'quantity', 'unit', 'exclusion', 'schedule', 'commercial'])
export const tenderDeviationStatusSchema = z.enum(['open', 'responded', 'accepted', 'rejected'])
export const tenderCriterionTypeSchema = z.enum(['price', 'technical', 'schedule', 'safety', 'experience', 'commercial', 'other'])
export const tenderVendorProfileStatusSchema = z.enum(['draft', 'reviewing', 'qualified', 'declined'])

export const opportunityTenderListQuerySchema = z.object({}).strict()

export const createOpportunityTenderCommandSchema = z.object({
  opportunityId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  title: nonEmptyText(255),
  reference: nonEmptyText(120),
  sourceMode: tenderSourceModeSchema,
  torDocumentId: z.string().uuid().nullable(),
  boqDocumentId: z.string().uuid().nullable(),
  closingAt: isoDateTime.nullable(),
}).strict().superRefine((value, context) => {
  if (value.sourceMode === 'client_issued_boq' && !value.boqDocumentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['boqDocumentId'], message: 'Client-issued BOQ mode requires a BOQ document.' })
  }
})

export const updateOpportunityTenderCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: nonEmptyText(255),
  reference: nonEmptyText(120),
  sourceMode: tenderSourceModeSchema,
  torDocumentId: z.string().uuid().nullable(),
  boqDocumentId: z.string().uuid().nullable(),
  closingAt: isoDateTime.nullable(),
}).strict().superRefine((value, context) => {
  if (value.sourceMode === 'client_issued_boq' && !value.boqDocumentId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['boqDocumentId'], message: 'Client-issued BOQ mode requires a BOQ document.' })
  }
})

export const tenderStatusCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  status: tenderPackageStatusSchema,
}).strict()

export const bindTenderBomCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  bomId: z.string().uuid().nullable(),
}).strict()

export const createTenderDeviationCommandSchema = z.object({
  category: tenderDeviationCategorySchema,
  title: nonEmptyText(255),
  description: nonEmptyText(10000),
  sourceReference: boundedText(255),
  ownerId: z.string().uuid().nullable(),
}).strict()

export const updateTenderDeviationCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  category: tenderDeviationCategorySchema,
  title: nonEmptyText(255),
  description: nonEmptyText(10000),
  sourceReference: boundedText(255),
  response: boundedText(10000),
  ownerId: z.string().uuid().nullable(),
  status: tenderDeviationStatusSchema,
}).strict()

export const createTenderCriterionCommandSchema = z.object({
  name: nonEmptyText(160),
  description: boundedText(5000),
  criterionType: tenderCriterionTypeSchema,
  weightBps: z.number().int().min(1).max(10000),
  isRequired: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
}).strict()

export const updateTenderCriterionCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  name: nonEmptyText(160),
  description: boundedText(5000),
  criterionType: tenderCriterionTypeSchema,
  weightBps: z.number().int().min(1).max(10000),
  isRequired: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000),
}).strict()

export const createTenderVendorProfileCommandSchema = z.object({
  vendorId: z.string().uuid(),
  trade: boundedText(120),
  capabilitySummary: boundedText(10000),
  qualificationSummary: boundedText(10000),
  availabilityNotes: boundedText(5000),
  complianceNotes: boundedText(5000),
}).strict()

export const updateTenderVendorProfileCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  trade: boundedText(120),
  capabilitySummary: boundedText(10000),
  qualificationSummary: boundedText(10000),
  availabilityNotes: boundedText(5000),
  complianceNotes: boundedText(5000),
  status: tenderVendorProfileStatusSchema,
}).strict()

export const upsertTenderEvaluationScoreCommandSchema = z.object({
  vendorProfileId: z.string().uuid(),
  criterionId: z.string().uuid(),
  expectedVersion: z.number().int().min(1).nullable(),
  scoreBps: z.number().int().min(0).max(10000),
  notes: boundedText(10000),
}).strict()

export const opportunityTenderRowSchema = z.object({
  id: z.string().uuid(),
  opportunityId: z.string().uuid(),
  title: z.string().trim().min(1).max(255),
  reference: z.string().trim().min(1).max(120),
  sourceMode: tenderSourceModeSchema,
  status: tenderPackageStatusSchema,
  torDocumentId: z.string().uuid().nullable(),
  boqDocumentId: z.string().uuid().nullable(),
  boundBomId: z.string().uuid().nullable(),
  closingAt: isoDateTime.nullable(),
  submittedAt: isoDateTime.nullable(),
  version: z.number().int().min(1),
  createdBy: z.string().uuid().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).strict()

export const tenderDeviationRowSchema = z.object({
  id: z.string().uuid(),
  tenderId: z.string().uuid(),
  category: tenderDeviationCategorySchema,
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(10000),
  sourceReference: z.string().max(255),
  response: z.string().max(10000),
  ownerId: z.string().uuid().nullable(),
  status: tenderDeviationStatusSchema,
  version: z.number().int().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).strict()

export const tenderCriterionRowSchema = z.object({
  id: z.string().uuid(),
  tenderId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(5000),
  criterionType: tenderCriterionTypeSchema,
  weightBps: z.number().int().min(1).max(10000),
  isRequired: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  version: z.number().int().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).strict()

export const tenderVendorProfileRowSchema = z.object({
  id: z.string().uuid(),
  tenderId: z.string().uuid(),
  vendorId: z.string().uuid(),
  vendorName: z.string().trim().min(1).max(255),
  trade: z.string().max(120),
  capabilitySummary: z.string().max(10000),
  qualificationSummary: z.string().max(10000),
  availabilityNotes: z.string().max(5000),
  complianceNotes: z.string().max(5000),
  status: tenderVendorProfileStatusSchema,
  version: z.number().int().min(1),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}).strict()

export const tenderEvaluationScoreRowSchema = z.object({
  id: z.string().uuid(),
  tenderId: z.string().uuid(),
  vendorProfileId: z.string().uuid(),
  criterionId: z.string().uuid(),
  scoreBps: z.number().int().min(0).max(10000),
  notes: z.string().max(10000),
  reviewedBy: z.string().uuid().nullable(),
  reviewedAt: isoDateTime.nullable(),
  version: z.number().int().min(1),
  updatedAt: isoDateTime,
}).strict()

export const tenderEvaluationSummaryRowSchema = z.object({
  vendorProfileId: z.string().uuid(),
  vendorName: z.string().trim().min(1).max(255),
  weightedScoreBps: z.number().int().min(0).max(10000),
  scoredCriteria: z.number().int().nonnegative(),
  criteriaCount: z.number().int().nonnegative(),
  complete: z.boolean(),
}).strict()

export const opportunityTenderDetailResultSchema = z.object({
  opportunityId: z.string().uuid(),
  tender: opportunityTenderRowSchema.nullable(),
  deviations: z.array(tenderDeviationRowSchema),
  criteria: z.array(tenderCriterionRowSchema),
  vendorProfiles: z.array(tenderVendorProfileRowSchema),
  scores: z.array(tenderEvaluationScoreRowSchema),
  evaluationSummary: z.array(tenderEvaluationSummaryRowSchema),
}).strict()

export const opportunityTenderMutationResultSchema = z.object({
  opportunityId: z.string().uuid(),
  changed: z.boolean(),
  tender: opportunityTenderRowSchema,
}).strict()

export const tenderNestedMutationResultSchema = z.object({
  tenderId: z.string().uuid(),
  changed: z.boolean(),
  row: z.union([
    tenderDeviationRowSchema,
    tenderCriterionRowSchema,
    tenderVendorProfileRowSchema,
    tenderEvaluationScoreRowSchema,
  ]),
}).strict()

export type TenderPackageStatus = z.infer<typeof tenderPackageStatusSchema>
export type TenderSourceMode = z.infer<typeof tenderSourceModeSchema>
export type TenderDeviationCategory = z.infer<typeof tenderDeviationCategorySchema>
export type TenderDeviationStatus = z.infer<typeof tenderDeviationStatusSchema>
export type TenderCriterionType = z.infer<typeof tenderCriterionTypeSchema>
export type TenderVendorProfileStatus = z.infer<typeof tenderVendorProfileStatusSchema>
export type OpportunityTenderListQuery = z.infer<typeof opportunityTenderListQuerySchema>
export type CreateOpportunityTenderCommand = z.infer<typeof createOpportunityTenderCommandSchema>
export type UpdateOpportunityTenderCommand = z.infer<typeof updateOpportunityTenderCommandSchema>
export type TenderStatusCommand = z.infer<typeof tenderStatusCommandSchema>
export type BindTenderBomCommand = z.infer<typeof bindTenderBomCommandSchema>
export type CreateTenderDeviationCommand = z.infer<typeof createTenderDeviationCommandSchema>
export type UpdateTenderDeviationCommand = z.infer<typeof updateTenderDeviationCommandSchema>
export type CreateTenderCriterionCommand = z.infer<typeof createTenderCriterionCommandSchema>
export type UpdateTenderCriterionCommand = z.infer<typeof updateTenderCriterionCommandSchema>
export type CreateTenderVendorProfileCommand = z.infer<typeof createTenderVendorProfileCommandSchema>
export type UpdateTenderVendorProfileCommand = z.infer<typeof updateTenderVendorProfileCommandSchema>
export type UpsertTenderEvaluationScoreCommand = z.infer<typeof upsertTenderEvaluationScoreCommandSchema>
export type OpportunityTenderRow = z.infer<typeof opportunityTenderRowSchema>
export type TenderDeviationRow = z.infer<typeof tenderDeviationRowSchema>
export type TenderCriterionRow = z.infer<typeof tenderCriterionRowSchema>
export type TenderVendorProfileRow = z.infer<typeof tenderVendorProfileRowSchema>
export type TenderEvaluationScoreRow = z.infer<typeof tenderEvaluationScoreRowSchema>
export type OpportunityTenderDetailResult = z.infer<typeof opportunityTenderDetailResultSchema>
export type OpportunityTenderMutationResult = z.infer<typeof opportunityTenderMutationResultSchema>
export type TenderNestedMutationResult = z.infer<typeof tenderNestedMutationResultSchema>
