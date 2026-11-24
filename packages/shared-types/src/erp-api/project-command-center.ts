import { z } from 'zod'
import { isoDateTimeString } from '../iso-datetime'

/** Project-scoped operational signals returned by the Core read authority. */
export const projectCommandCenterResultSchema = z
  .object({
    tenantId: z.string().guid(),
    projectId: z.string().guid(),
    pendingTasks: z.number().int().nonnegative(),
    overdueTasks: z.number().int().nonnegative(),
    documents: z.number().int().nonnegative(),
    pendingDecisions: z.number().int().nonnegative(),
    openPunchlist: z.number().int().nonnegative(),
    activeDeliveries: z.number().int().nonnegative(),
    progressPercent: z.number().min(0).max(100).nullable(),
    progressWeekEnding: isoDateTimeString({ offset: true }).nullable(),
  })
  .strict()

export const projectCommandCenterQuerySchema = z.object({}).strict()

export type ProjectCommandCenterResult = z.infer<
  typeof projectCommandCenterResultSchema
>
export type ProjectCommandCenterQuery = z.infer<
  typeof projectCommandCenterQuerySchema
>
