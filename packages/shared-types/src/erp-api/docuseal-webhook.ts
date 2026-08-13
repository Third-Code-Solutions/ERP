import { z } from 'zod'

const signedDocumentSchema = z
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
    documents: z.array(signedDocumentSchema).max(10).default([]),
  })
  .strict()

export type DocuSealWebhookCommand = z.infer<
  typeof docuSealWebhookCommandSchema
>

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
    signedDocument: signedDocumentSchema.nullable(),
  })
  .strict()

export type DocuSealWebhookResult = z.infer<
  typeof docuSealWebhookResultSchema
>
