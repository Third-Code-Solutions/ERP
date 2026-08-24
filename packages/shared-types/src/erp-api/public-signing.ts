import { z } from 'zod'

const signableEntityTypeSchema = z.enum([
  'bom',
  'contract',
  'variation_order',
  'coc',
])

/** Public signing input. The token is carried in the URL, never the body. */
export const publicSigningBodySchema = z
  .object({
    signerName: z.string().trim().min(1).max(255),
    signerEmail: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((value) => value.toLowerCase())
      .nullable()
      .optional(),
    signatureDataUrl: z.string().trim().min(1).max(700_000),
  })
  .strict()

export const publicSigningCommandSchema = z
  .object({
    token: z.string().regex(/^[0-9a-f]{64}$/i),
    signerName: z.string().trim().min(1).max(255),
    signerEmail: z
      .string()
      .trim()
      .email()
      .max(255)
      .transform((value) => value.toLowerCase())
      .nullable()
      .optional(),
    signatureDataUrl: z.string().trim().min(1).max(700_000),
  })
  .strict()

export const publicSigningResultSchema = z
  .object({
    sessionId: z.string().uuid(),
    tenantId: z.string().uuid(),
    entityType: signableEntityTypeSchema,
    entityId: z.string().uuid(),
    signatureDocumentId: z.string().uuid(),
    signedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type PublicSigningBody = z.infer<typeof publicSigningBodySchema>
export type PublicSigningCommand = z.infer<typeof publicSigningCommandSchema>
export type PublicSigningResult = z.infer<typeof publicSigningResultSchema>
