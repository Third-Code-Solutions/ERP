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

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Posting date requires YYYY-MM-DD')
  .refine((value) => {
    const [yearText, monthText, dayText] = value.split('-')
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    if (year < 1 || month < 1 || month > 12 || day < 1) return false
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const daysInMonth = [
      31,
      leap ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ]
    return day <= daysInMonth[month - 1]!
  }, 'Posting date must be a real calendar date')

export const journalReverseBodySchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const journalReverseCommandSchema = z
  .object({
    journalEntryId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
    postingDate: isoDateSchema,
  })
  .strict()

export const journalReverseResultSchema = z
  .object({
    journalEntryId: z.string().uuid(),
    tenantId: z.string().uuid(),
    reversalJournalEntryId: z.string().uuid(),
    reversalNumber: z.string().regex(/^JE-\d{4}-\d{6}$/),
  })
  .strict()

export type JournalReverseCommand = z.infer<typeof journalReverseCommandSchema>
export type JournalReverseBody = z.infer<typeof journalReverseBodySchema>
export type JournalReverseResult = z.infer<typeof journalReverseResultSchema>
