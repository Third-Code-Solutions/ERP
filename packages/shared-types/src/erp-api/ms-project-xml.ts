import { z } from 'zod'
import { projectScheduleLevelSchema } from './project-schedule'

export const MS_PROJECT_XML_PARSER_VERSION = 'ms-project-xml-v1'
export const MS_PROJECT_XML_MAX_DECODED_BYTES = 1_048_576
export const MS_PROJECT_XML_MAX_TASKS = 500
export const MS_PROJECT_XML_MAX_XML_DEPTH = 64
export const MS_PROJECT_XML_MAX_XML_ELEMENTS = 20_000
export const MS_PROJECT_XML_MAX_ISSUES = 128
export const MS_PROJECT_XML_MAX_FIELD_LENGTH = 1_000

/** Microsoft Project's documented export namespace. */
export const MS_PROJECT_XML_NAMESPACE = 'http://schemas.microsoft.com/project'
/** Project 2007's Microsoft reference lists this target namespace: https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2007/bb968695(v=office.12). */
export const MS_PROJECT_XML_2007_NAMESPACE = 'http://schemas.microsoft.com/project/2007'
export const MS_PROJECT_XML_DISCLOSURES = [
  'Planning dates and hierarchy only; actuals, progress, resources, calendars, costs, and labour are not imported.',
  'Sub-day scheduling and source calendars are not reproduced; source date/time evidence is shown while the current register stores calendar dates.',
  'Every XML task requires explicit reviewed L1-L4 mapping before commit; XML outline depth is not an ABI schedule level.',
] as const

const maxBase64Length = Math.ceil(MS_PROJECT_XML_MAX_DECODED_BYTES / 3) * 4
const canonicalBase64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/
const sourceDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
const uuidSchema = z.string().guid().transform((value) => value.toLowerCase())

function isRealCalendarDate(value: string): boolean {
  if (!calendarDatePattern.test(value)) return false
  const [yearText, monthText, dayText] = value.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - 1, day)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export const msProjectXmlBase64Schema = z
  .string()
  .min(1, 'XML source is required.')
  .max(maxBase64Length, 'XML source exceeds the 1 MiB decoded limit.')
  .refine((value) => value.length % 4 === 0 && canonicalBase64Pattern.test(value), 'XML source must be canonical base64.')

export const msProjectXmlFileNameSchema = z.string().trim().min(1).max(255)

export const msProjectXmlPreviewCommandSchema = z
  .object({
    projectId: uuidSchema,
    sourceBase64: msProjectXmlBase64Schema,
    fileName: msProjectXmlFileNameSchema.optional(),
  })
  .strict()

export const msProjectXmlDateEvidenceSchema = z
  .object({
    raw: z.string().trim().min(1).max(64).regex(sourceDateTimePattern, 'Use a complete XML dateTime value.'),
    calendarDate: z.string().refine(isRealCalendarDate, 'Use a real calendar date.'),
  })
  .strict()

export const msProjectXmlPredecessorEvidenceSchema = z
  .object({
    predecessorUid: z.number().int().min(1).max(2_147_483_647),
    typeCode: z.literal(1),
    type: z.literal('finish-to-start'),
    crossProject: z.literal(false),
    crossProjectName: z.null(),
    linkLag: z.literal(0),
    lagFormat: z.number().int().min(0).max(255).nullable(),
  })
  .strict()

export const msProjectXmlPreviewTaskSchema = z
  .object({
    sourceUid: z.number().int().min(1).max(2_147_483_647),
    sourceId: z.number().int().min(0).max(2_147_483_647).nullable(),
    outlineNumber: z.string().trim().min(1).max(255).nullable(),
    outlineLevel: z.number().int().min(1).max(MS_PROJECT_XML_MAX_XML_DEPTH),
    outlinePath: z.array(z.string().trim().min(1).max(255)).min(1).max(MS_PROJECT_XML_MAX_XML_DEPTH),
    name: z.string().trim().min(1).max(200),
    isSummary: z.boolean(),
    sourceStart: msProjectXmlDateEvidenceSchema,
    sourceFinish: msProjectXmlDateEvidenceSchema,
    parentSourceUid: z.number().int().min(1).max(2_147_483_647).nullable(),
    predecessor: msProjectXmlPredecessorEvidenceSchema.nullable(),
  })
  .strict()

export const msProjectXmlIssueCodeSchema = z.enum([
  'INVALID_BASE64',
  'SOURCE_TOO_LARGE',
  'INVALID_UTF8',
  'DTD_NOT_ALLOWED',
  'XML_PARSE_ERROR',
  'XML_WARNING',
  'XML_DEPTH_EXCEEDED',
  'XML_ELEMENT_COUNT_EXCEEDED',
  'ROOT_ELEMENT_INVALID',
  'ROOT_NAMESPACE_INVALID',
  'TASKS_MISSING',
  'TASK_COUNT_EXCEEDED',
  'PROJECT_SUMMARY_EXCLUDED',
  'TASK_UID_MISSING',
  'TASK_UID_INVALID',
  'DUPLICATE_TASK_UID',
  'TASK_ID_INVALID',
  'TASK_NAME_INVALID',
  'OUTLINE_NUMBER_INVALID',
  'OUTLINE_LEVEL_INVALID',
  'OUTLINE_HIERARCHY_INVALID',
  'TASK_DATE_MISSING',
  'TASK_DATE_INVALID',
  'TASK_DATE_ORDER_INVALID',
  'UNSUPPORTED_TASK',
  'DUPLICATE_PREDECESSOR',
  'PREDECESSOR_UID_MISSING',
  'PREDECESSOR_UID_INVALID',
  'PREDECESSOR_NOT_FOUND',
  'PREDECESSOR_LEVEL_MISMATCH',
  'UNSUPPORTED_DEPENDENCY_TYPE',
  'DEPENDENCY_LAG_NOT_SUPPORTED',
  'EXTERNAL_DEPENDENCY',
  'DEPENDENCY_CYCLE',
  'UNSUPPORTED_DEPTH_MAPPING',
])

export const msProjectXmlIssueSchema = z
  .object({
    code: msProjectXmlIssueCodeSchema,
    path: z.string().trim().max(200),
    message: z.string().trim().min(1).max(MS_PROJECT_XML_MAX_FIELD_LENGTH),
    severity: z.enum(['error', 'notice']),
  })
  .strict()

export const msProjectXmlTaskMappingSchema = z
  .object({
    sourceUid: z.number().int().min(1).max(2_147_483_647),
    sourceOutlineLevel: z.number().int().min(1).max(MS_PROJECT_XML_MAX_XML_DEPTH),
    level: projectScheduleLevelSchema,
    ownerId: uuidSchema.nullable(),
  })
  .strict()

export const msProjectXmlCommitCommandSchema = z
  .object({
    projectId: uuidSchema,
    sourceBase64: msProjectXmlBase64Schema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    parserVersion: z.literal(MS_PROJECT_XML_PARSER_VERSION),
    requestId: uuidSchema,
    mappings: z.array(msProjectXmlTaskMappingSchema).min(1).max(MS_PROJECT_XML_MAX_TASKS),
  })
  .strict()
  .superRefine((command, context) => {
    const seen = new Set<number>()
    command.mappings.forEach((mapping, index) => {
      if (seen.has(mapping.sourceUid)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['mappings', index, 'sourceUid'], message: 'Each source task UID may be mapped once.' })
      }
      seen.add(mapping.sourceUid)
    })
  })

export const msProjectXmlPreviewSchema = z
  .object({
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    sourceBytes: z.number().int().min(0).max(MS_PROJECT_XML_MAX_DECODED_BYTES),
    parserVersion: z.literal(MS_PROJECT_XML_PARSER_VERSION),
    fileName: msProjectXmlFileNameSchema.nullable(),
    projectName: z.string().max(255),
    tasks: z.array(msProjectXmlPreviewTaskSchema).max(MS_PROJECT_XML_MAX_TASKS),
    issues: z.array(msProjectXmlIssueSchema).max(MS_PROJECT_XML_MAX_ISSUES),
    notices: z.array(msProjectXmlIssueSchema).max(MS_PROJECT_XML_MAX_ISSUES),
    disclosures: z.array(z.string().trim().min(1).max(MS_PROJECT_XML_MAX_FIELD_LENGTH)).max(32),
    canImport: z.boolean(),
    omittedSummaryTask: z.object({ sourceUid: z.literal(0), name: z.string().trim().min(1).max(200) }).strict().nullable(),
  })
  .strict()
  .superRefine((preview, context) => {
    if (preview.issues.some((issue) => issue.severity === 'error') && preview.canImport) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['canImport'], message: 'A preview with errors cannot be imported.' })
    }
    if (preview.canImport && (!preview.sourceHash || preview.tasks.length === 0)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['canImport'], message: 'An importable preview needs a source hash and at least one task.' })
    }
  })

/** Core's tenant-bound response wrapper; the pure parser intentionally has no identity context. */
export const msProjectXmlPreviewResultSchema = z
  .object({
    tenantId: uuidSchema,
    actorId: uuidSchema,
    projectId: uuidSchema,
    preview: msProjectXmlPreviewSchema,
  })
  .strict()

export const msProjectXmlImportReceiptTaskSchema = z
  .object({
    sourceUid: z.number().int().min(1).max(2_147_483_647),
    taskId: uuidSchema,
    version: z.number().int().min(1),
    level: projectScheduleLevelSchema,
    ownerId: uuidSchema.nullable(),
  })
  .strict()

export const msProjectXmlImportReceiptSchema = z
  .object({
    tenantId: uuidSchema,
    actorId: uuidSchema,
    projectId: uuidSchema,
    requestId: uuidSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    parserVersion: z.literal(MS_PROJECT_XML_PARSER_VERSION),
    mappings: z.array(msProjectXmlTaskMappingSchema).min(1).max(MS_PROJECT_XML_MAX_TASKS),
    tasks: z.array(msProjectXmlImportReceiptTaskSchema).min(1).max(MS_PROJECT_XML_MAX_TASKS),
  })
  .strict()

export const msProjectXmlImportResultSchema = z
  .object({
    ok: z.literal(true),
    projectId: uuidSchema,
    requestId: uuidSchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    parserVersion: z.literal(MS_PROJECT_XML_PARSER_VERSION),
    created: z.boolean(),
    changed: z.boolean(),
    receipt: msProjectXmlImportReceiptSchema,
  })
  .strict()

export type MsProjectXmlPreviewCommand = z.infer<typeof msProjectXmlPreviewCommandSchema>
export type MsProjectXmlDateEvidence = z.infer<typeof msProjectXmlDateEvidenceSchema>
export type MsProjectXmlPredecessorEvidence = z.infer<typeof msProjectXmlPredecessorEvidenceSchema>
export type MsProjectXmlPreviewTask = z.infer<typeof msProjectXmlPreviewTaskSchema>
export type MsProjectXmlIssue = z.infer<typeof msProjectXmlIssueSchema>
export type MsProjectXmlTaskMapping = z.infer<typeof msProjectXmlTaskMappingSchema>
export type MsProjectXmlCommitCommand = z.infer<typeof msProjectXmlCommitCommandSchema>
export type MsProjectXmlPreview = z.infer<typeof msProjectXmlPreviewSchema>
export type MsProjectXmlPreviewResult = z.infer<typeof msProjectXmlPreviewResultSchema>
export type MsProjectXmlImportReceiptTask = z.infer<typeof msProjectXmlImportReceiptTaskSchema>
export type MsProjectXmlImportReceipt = z.infer<typeof msProjectXmlImportReceiptSchema>
export type MsProjectXmlImportResult = z.infer<typeof msProjectXmlImportResultSchema>
