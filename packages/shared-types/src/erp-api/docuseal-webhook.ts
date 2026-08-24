import { z } from 'zod'

const providerDocumentSchema = z
  .object({
    url: z
      .string()
      .url()
      .max(2_048)
      .refine((value) => {
        const protocol = new URL(value).protocol
        return protocol === 'http:' || protocol === 'https:'
      }, 'must use http or https'),
    name: z.string().trim().min(1).max(255).optional(),
  })
  .strict()

export const docuSealWebhookCommandSchema = z
  .object({
    event: z.enum([
      'submission.completed',
      'submission.opened',
      'submission.expired',
    ]),
    // Matches bom_portal_tokens.docuseal_submission_id varchar(128).
    submissionId: z.string().trim().min(1).max(128),
    documents: z.array(providerDocumentSchema).max(10).default([]),
  })
  .strict()
  .superRefine((command, context) => {
    if (command.event === 'submission.completed' && command.documents.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.too_small,
        type: 'array',
        minimum: 1,
        inclusive: true,
        path: ['documents'],
        message: 'submission.completed requires at least one document',
      })
    }
  })

export type DocuSealWebhookCommand = z.infer<
  typeof docuSealWebhookCommandSchema
>

const persistedDocumentSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    storagePath: z
      .string()
      .trim()
      .min(1)
      .max(1_024)
      .refine((value) => !/^https?:\/\//i.test(value), 'must be an object path'),
    sizeBytes: z.number().int().positive(),
  })
  .strict()

export const docuSealWebhookResultSchema = z
  .object({
    received: z.literal(true),
    handled: z.boolean(),
    duplicate: z.boolean(),
    tenantId: z.string().uuid().nullable(),
    bomId: z.string().uuid().nullable(),
    projectId: z.string().uuid().nullable(),
    projectName: z.string().max(255).nullable(),
    tcvCents: z.number().int().nonnegative().nullable(),
    signedDocument: persistedDocumentSchema.nullable(),
  })
  .strict()

export type DocuSealWebhookResult = z.infer<
  typeof docuSealWebhookResultSchema
>
