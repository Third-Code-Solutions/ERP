import { z } from 'zod'

export const journalPostCommandSchema = z
  .object({
    journalEntryId: z.string().uuid(),
  })
  .strict()

export const journalPostResultSchema = z
  .object({
    journalEntryId: z.string().uuid(),
    tenantId: z.string().uuid(),
    postedNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type JournalPostCommand = z.infer<typeof journalPostCommandSchema>
export type JournalPostResult = z.infer<typeof journalPostResultSchema>
