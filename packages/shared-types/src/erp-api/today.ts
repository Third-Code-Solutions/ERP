import { z } from 'zod'

const todaySummarySchema = z
  .object({
    dueToday: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
  })
  .strict()

const todayTaskSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(255),
    projectId: z.string().uuid(),
    projectName: z.string().trim().min(1).max(255),
    dueDate: z.string().datetime({ offset: true }),
    dueState: z.enum(['overdue', 'today', 'upcoming']),
  })
  .strict()

const todayProjectSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(255),
    client: z.string().trim().min(1).max(255),
    status: z.string().trim().min(1).max(64),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const todayCommandCenterResultSchema = z
  .object({
    summary: todaySummarySchema,
    tasks: z.array(todayTaskSchema).max(8),
    projects: z.array(todayProjectSchema).max(6),
  })
  .strict()

export type TodayCommandCenterResult = z.infer<
  typeof todayCommandCenterResultSchema
>

const includeProjectsQueryValueSchema = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 'true')

export const todayQuerySchema = z
  .object({
    includeProjects: z.preprocess(
      (value) => (value === undefined ? false : value),
      includeProjectsQueryValueSchema
    ),
  })
  .strict()

export type TodayQuery = z.infer<typeof todayQuerySchema>
