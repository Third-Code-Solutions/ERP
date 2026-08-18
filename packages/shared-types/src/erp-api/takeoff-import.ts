import { z } from 'zod'

export const TAKEOFF_IMPORT_MAX_ROWS = 5_000
// Core's explicit JSON parser cap is 4 MB. Keep this command well below that
// transport ceiling after UTF-8 encoding so both the Web adapter and direct
// Core callers receive a controlled validation error rather than a parser
// rejection.
export const TAKEOFF_IMPORT_MAX_COMMAND_BYTES = 2_000_000

export function takeoffImportCommandByteLength(command: unknown): number {
  return new TextEncoder().encode(JSON.stringify(command) ?? '').byteLength
}

const takeoffRawValueSchema = z.union([
  z.string().max(1_000),
  z.number().finite(),
  z.null(),
])

const takeoffRawPayloadSchema = z
  .record(takeoffRawValueSchema)
  .superRefine((payload, context) => {
    if (Object.keys(payload).length > 64) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Takeoff raw payload contains too many columns.',
      })
    }
  })

export const takeoffImportRowSchema = z
  .object({
    sourceRowKey: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4_000),
    quantity: z.number().finite().nullable(),
    unit: z.string().trim().max(64),
    division: z.string().trim().max(255).nullable(),
    location: z.string().trim().max(255).nullable(),
    itemNo: z.string().trim().max(255).nullable(),
    notes: z.string().trim().max(4_000).nullable(),
    raw: takeoffRawPayloadSchema,
  })
  .strict()

export const takeoffImportMappingSchema = z
  .record(z.string().trim().min(1).max(128))
  .superRefine((mapping, context) => {
    if (Object.keys(mapping).length > 32) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Takeoff mapping contains too many columns.',
      })
    }
  })

const takeoffImportCommandInputSchema = z
  .object({
    mode: z.enum(['preview', 'commit']),
    // Existing spreadsheet/CSV imports keep their explicit BOM target. The
    // ai_document target is intentionally different: Core resolves a draft
    // candidate BOM only after proving the source document belongs to the
    // authenticated tenant and project.
    target: z.enum(['existing_bom', 'ai_document']).optional(),
    bomId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    sourceModel: z.string().trim().min(1).max(255).optional(),
    source: z.string().trim().min(1).max(100),
    drawingRevisionKey: z.string().trim().min(1).max(500),
    fileName: z.string().trim().min(1).max(255),
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    mapping: takeoffImportMappingSchema,
    missingColumns: z.array(z.string().trim().min(1).max(128)).max(32),
    rows: z.array(takeoffImportRowSchema).max(TAKEOFF_IMPORT_MAX_ROWS),
  })
  .strict()
  .superRefine((command, context) => {
    const target = command.target ?? 'existing_bom'
    if (target === 'existing_bom') {
      if (!command.bomId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bomId'],
          message: 'bomId is required when target is existing_bom.',
        })
      }
      if (
        command.projectId !== undefined ||
        command.documentId !== undefined ||
        command.sourceModel !== undefined
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['target'],
          message:
            'existing_bom commands cannot include project, document, or model authority.',
        })
      }
      if (command.source.toLowerCase() === 'ai-document') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['source'],
          message: 'ai-document source requires the ai_document target.',
        })
      }
    } else {
      if (command.mode !== 'commit') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mode'],
          message: 'ai_document candidates may only be committed.',
        })
      }
      if (command.bomId !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['bomId'],
          message: 'ai_document commands must not choose a BOM target.',
        })
      }
      if (!command.projectId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['projectId'],
          message: 'projectId is required for ai_document candidates.',
        })
      }
      if (!command.documentId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['documentId'],
          message: 'documentId is required for ai_document candidates.',
        })
      }
      if (!command.sourceModel) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceModel'],
          message: 'sourceModel is required for ai_document candidates.',
        })
      }
      if (command.source !== 'ai-document') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['source'],
          message: 'ai_document candidates must use source ai-document.',
        })
      }
    }
    if (
      takeoffImportCommandByteLength(command) >
      TAKEOFF_IMPORT_MAX_COMMAND_BYTES
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Takeoff import command is too large. Split the source file.',
      })
    }
  })

export const takeoffImportCommandSchema = takeoffImportCommandInputSchema.transform(
  (command) => {
    const target = command.target ?? 'existing_bom'
    if (target === 'ai_document') {
      return {
        mode: command.mode,
        target,
        projectId: command.projectId!,
        documentId: command.documentId!,
        sourceModel: command.sourceModel!,
        source: command.source,
        drawingRevisionKey: command.drawingRevisionKey,
        fileName: command.fileName,
        contentSha256: command.contentSha256,
        mapping: command.mapping,
        missingColumns: command.missingColumns,
        rows: command.rows,
      }
    }

    return {
      mode: command.mode,
      target,
      bomId: command.bomId!,
      source: command.source,
      drawingRevisionKey: command.drawingRevisionKey,
      fileName: command.fileName,
      contentSha256: command.contentSha256,
      mapping: command.mapping,
      missingColumns: command.missingColumns,
      rows: command.rows,
    }
  }
)

export const takeoffImportValidationIssueSchema = z
  .object({
    sourceRowKey: z.string().trim().min(1).max(255),
    code: z.enum([
      'DUPLICATE_SOURCE_ROW_KEY',
      'EMPTY_DESCRIPTION',
      'INVALID_QUANTITY',
      'INVALID_UOM',
      'MISSING_DIVISION',
      'NO_CATALOG_MATCH',
      'MATERIAL_PARENT_REQUIRED',
    ]),
    message: z.string().trim().min(1).max(1_000),
  })
  .strict()

const takeoffImportPreviewRowSchema = z
  .object({
    sourceRowKey: z.string().trim().min(1).max(255),
    description: z.string().trim().max(4_000),
    quantity: z.number().finite().nullable(),
    unit: z.string().trim().max(64),
    division: z.string().trim().max(255).nullable(),
    location: z.string().trim().max(255).nullable(),
    itemNo: z.string().trim().max(255).nullable(),
  })
  .strict()

export const takeoffImportPreviewResultSchema = z
  .object({
    ok: z.literal(true),
    mode: z.literal('preview'),
    tenantId: z.string().uuid(),
    bomId: z.string().uuid(),
    source: z.string().trim().min(1).max(100),
    sourceKey: z.string().regex(/^[a-f0-9]{64}$/),
    drawingRevisionKey: z.string().trim().min(1).max(500),
    contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
    rowCount: z.number().int().nonnegative().max(TAKEOFF_IMPORT_MAX_ROWS),
    validCount: z.number().int().nonnegative().max(TAKEOFF_IMPORT_MAX_ROWS),
    unresolvedCount: z.number().int().nonnegative(),
    missingColumns: z.array(z.string().trim().min(1).max(128)).max(32),
    validationIssues: z.array(takeoffImportValidationIssueSchema),
    rows: z.array(takeoffImportPreviewRowSchema).max(TAKEOFF_IMPORT_MAX_ROWS),
  })
  .strict()

export const takeoffImportCommitResultSchema = z
  .object({
    ok: z.literal(true),
    mode: z.literal('commit'),
    tenantId: z.string().uuid(),
    importId: z.string().uuid(),
    source: z.string().trim().min(1).max(100),
    sourceKey: z.string().regex(/^[a-f0-9]{64}$/),
    linesUpserted: z.number().int().nonnegative().max(TAKEOFF_IMPORT_MAX_ROWS),
    unresolvedCount: z.number().int().nonnegative(),
    bomId: z.string().uuid(),
  })
  .strict()

export const takeoffImportResultSchema = z.discriminatedUnion('mode', [
  takeoffImportPreviewResultSchema,
  takeoffImportCommitResultSchema,
])

export type TakeoffImportCommand = z.infer<typeof takeoffImportCommandSchema>
export type TakeoffImportRow = z.infer<typeof takeoffImportRowSchema>
export type TakeoffImportPreviewResult = z.infer<
  typeof takeoffImportPreviewResultSchema
>
export type TakeoffImportCommitResult = z.infer<
  typeof takeoffImportCommitResultSchema
>
export type TakeoffImportResult = z.infer<typeof takeoffImportResultSchema>
