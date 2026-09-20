import { z } from 'zod'

export const inspectionReportArchiveCommandSchema = z.object({
  opportunityId: z.string().uuid(),
  inspectionId: z.string().uuid(),
}).strict()

export const inspectionReportArchiveResultSchema = z.object({
  tenantId: z.string().uuid(),
  opportunityId: z.string().uuid(),
  inspectionId: z.string().uuid(),
  documentId: z.string().uuid(),
  status: z.literal('archived'),
  replayed: z.boolean(),
}).strict()

export type InspectionReportArchiveCommand = z.infer<typeof inspectionReportArchiveCommandSchema>
export type InspectionReportArchiveResult = z.infer<typeof inspectionReportArchiveResultSchema>
