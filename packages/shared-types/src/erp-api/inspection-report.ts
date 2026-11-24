import { z } from 'zod'

export const inspectionReportArchiveCommandSchema = z.object({
  opportunityId: z.string().guid(),
  inspectionId: z.string().guid(),
}).strict()

export const inspectionReportArchiveResultSchema = z.object({
  tenantId: z.string().guid(),
  opportunityId: z.string().guid(),
  inspectionId: z.string().guid(),
  documentId: z.string().guid(),
  status: z.literal('archived'),
  replayed: z.boolean(),
}).strict()

export type InspectionReportArchiveCommand = z.infer<typeof inspectionReportArchiveCommandSchema>
export type InspectionReportArchiveResult = z.infer<typeof inspectionReportArchiveResultSchema>
