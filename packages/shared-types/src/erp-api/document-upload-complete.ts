import { z } from 'zod'
import { documentIntakeDocumentTypeSchema } from './document-intake'

/**
 * The response contract kept by the legacy Next upload endpoint. This is
 * deliberately separate from the Core intake command: deterministic source
 * reading remains a Web concern until a later, evidence-backed cutover.
 */
export const documentUploadCadResultSchema = z
  .object({
    status: z.enum([
      'extracted',
      'binary-dwg-pending',
      'queued',
      'processing',
      'succeeded',
      'failed',
      'processing-unavailable',
      'unknown-format',
      'download-failed',
      'no-items',
      'ocr-unavailable',
      'ai-not-configured',
      'too-large',
      'parse-failed',
      'core-unavailable',
      'error',
    ]),
    scopeItemsCreated: z.number().int().nonnegative(),
    warnings: z.array(z.string().max(2_000)).max(100),
    layerCount: z.number().int().nonnegative(),
    entityCount: z.number().int().nonnegative(),
    detectedFormat: z.enum([
      'dxf',
      'dwg',
      'pdf',
      'image',
      'spreadsheet',
      'csv',
      'docx',
      'unknown',
    ]),
    dwgVersion: z.string().max(127).nullable(),
    extensionMismatch: z.boolean(),
    message: z.string().max(2_000),
    bomId: z.string().uuid().nullable(),
    bomTcvCents: z.number().int().nonnegative(),
    bomCostCents: z.number().int().nonnegative(),
    // GP can legitimately be negative for an over-budget estimate.
    bomGpMarginBps: z.number().int().min(-1_000_000).max(1_000_000),
    ragMatches: z.number().int().nonnegative(),
    aiEstimateMatches: z.number().int().nonnegative(),
    // Retained for responses from earlier explicit AI/CAD producers. The
    // standard deterministic upload path never creates a candidate BOM.
    unpricedCandidateBom: z.boolean().optional(),
    processingJobId: z.string().uuid().nullable().optional(),
    // Deterministic non-CAD read metadata. Source text remains in private
    // tenant-scoped storage; the response exposes only bounded evidence.
    extractedCharacters: z.number().int().nonnegative().max(250_000).optional(),
    extractionPages: z.number().int().nonnegative().max(500).nullable().optional(),
    extractionSheets: z.number().int().nonnegative().max(10_000).nullable().optional(),
    extractionOcrConfidence: z.number().min(0).max(100).nullable().optional(),
    extractionCacheHit: z.boolean().optional(),
  })
  .strict()

export const documentUploadCompleteResultSchema = z
  .object({
    id: z.string().uuid(),
    storagePath: z.string().trim().min(1).max(2_000),
    documentType: documentIntakeDocumentTypeSchema,
    cadFormat: z.enum(['dxf', 'dwg']).nullable(),
    cadParseQueued: z.boolean().optional(),
    cadParseWarning: z.string().max(2_000).optional(),
    cadResult: documentUploadCadResultSchema.optional(),
  })
  .strict()

export type DocumentUploadCadResult = z.infer<
  typeof documentUploadCadResultSchema
>
export type DocumentUploadCompleteResult = z.infer<
  typeof documentUploadCompleteResultSchema
>
