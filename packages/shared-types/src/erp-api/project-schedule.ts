import { z } from 'zod'

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((value) => {
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === (month ?? 0) - 1 && parsed.getUTCDate() === day
}, 'Use a real calendar date.')
const text = (max: number, required = false) => {
  const base = z.string().trim().max(max)
  return required ? base.min(1) : base.default('')
}

export const projectScheduleLevelSchema = z.enum(['l1', 'l2', 'l3', 'l4'])
export const projectScheduleTaskStatusSchema = z.enum(['planned', 'in_progress', 'blocked', 'completed', 'cancelled'])
export const projectScheduleCommitmentStatusSchema = z.enum(['not_set', 'committed', 'complete', 'not_done'])
export const projectScheduleSourceSchema = z.enum(['manual', 'legacy_l1', 'ms_project'])

export const importLegacyProjectScheduleCommandSchema = z.object({
  sourceScheduleId: z.string().uuid(),
}).strict()

export const legacyProjectScheduleTasksSchema = z.array(z.object({
  name: z.string().trim().min(1).max(200),
  start_date: calendarDateSchema,
  finish_date: calendarDateSchema,
  predecessor_index: z.number().int().min(0).nullable(),
  planned_pct_curve: z.array(z.number().finite().min(0).max(100)).max(1000),
}).strict()).min(1).max(1000).superRefine((tasks, context) => {
  tasks.forEach((task, index) => {
    const fail = (field: string, message: string) => context.addIssue({ code: z.ZodIssueCode.custom, path: [index, field], message })
    if (task.finish_date < task.start_date) fail('finish_date', 'Finish must follow start.')
    if (task.predecessor_index !== null && task.predecessor_index >= tasks.length) fail('predecessor_index', 'Predecessor is outside the schedule.')
    if (task.planned_pct_curve.some((value, position) => position > 0 && value < task.planned_pct_curve[position - 1]!)) fail('planned_pct_curve', 'Planned percentages must be cumulative.')
    const visited = new Set<number>([index])
    let predecessor = task.predecessor_index
    while (predecessor !== null && predecessor < tasks.length) {
      if (visited.has(predecessor)) { fail('predecessor_index', 'Predecessor cycle detected.'); break }
      visited.add(predecessor)
      predecessor = tasks[predecessor]!.predecessor_index
    }
  })
})

export const projectScheduleListQuerySchema = z.object({
  level: projectScheduleLevelSchema.optional(),
  status: projectScheduleTaskStatusSchema.optional(),
  commitmentStatus: projectScheduleCommitmentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

const scheduleFields = {
  level: projectScheduleLevelSchema,
  taskCode: text(80, true),
  name: text(200, true),
  description: text(5000),
  parentTaskId: z.string().uuid().nullable(),
  predecessorTaskId: z.string().uuid().nullable(),
  plannedStart: calendarDateSchema,
  plannedFinish: calendarDateSchema,
  plannedLaborMinutes: z.number().int().min(0).max(100_000_000),
  ownerId: z.string().uuid().nullable(),
  commitmentWeek: calendarDateSchema.nullable(),
  commitmentStatus: projectScheduleCommitmentStatusSchema,
  constraintReason: text(2000),
}

function refineDates(value: { plannedStart: string; plannedFinish: string; commitmentStatus: string; constraintReason: string }, context: z.RefinementCtx): void {
  if (value.plannedFinish < value.plannedStart) context.addIssue({ code: z.ZodIssueCode.custom, path: ['plannedFinish'], message: 'Planned finish must be on or after planned start.' })
  if (value.commitmentStatus === 'not_done' && !value.constraintReason) context.addIssue({ code: z.ZodIssueCode.custom, path: ['constraintReason'], message: 'A constraint reason is required when a commitment is not done.' })
}

export const createProjectScheduleTaskCommandSchema = z.object({
  projectId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  ...scheduleFields,
}).strict().superRefine(refineDates)

export const updateProjectScheduleTaskCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  ...scheduleFields,
}).strict().superRefine(refineDates)

export const projectScheduleTaskStatusCommandSchema = z.object({
  expectedVersion: z.number().int().min(1),
  status: projectScheduleTaskStatusSchema,
  percentComplete: z.number().int().min(0).max(100),
  actualStart: calendarDateSchema.nullable(),
  actualFinish: calendarDateSchema.nullable(),
  actualLaborMinutes: z.number().int().min(0).max(100_000_000),
  commitmentWeek: calendarDateSchema.nullable(),
  commitmentStatus: projectScheduleCommitmentStatusSchema,
  constraintReason: text(2000),
}).strict().superRefine((value, context) => {
  if (value.status === 'completed' && value.percentComplete !== 100) context.addIssue({ code: z.ZodIssueCode.custom, path: ['percentComplete'], message: 'Completed tasks must be at 100%.' })
  if (value.status === 'completed' && !value.actualFinish) context.addIssue({ code: z.ZodIssueCode.custom, path: ['actualFinish'], message: 'Completed tasks require an actual finish date.' })
  if (value.commitmentStatus === 'not_done' && !value.constraintReason) context.addIssue({ code: z.ZodIssueCode.custom, path: ['constraintReason'], message: 'A constraint reason is required when a commitment is not done.' })
})

export const projectScheduleTaskRowSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  level: projectScheduleLevelSchema,
  taskCode: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  parentTaskId: z.string().uuid().nullable(),
  predecessorTaskId: z.string().uuid().nullable(),
  plannedStart: calendarDateSchema,
  plannedFinish: calendarDateSchema,
  actualStart: calendarDateSchema.nullable(),
  actualFinish: calendarDateSchema.nullable(),
  percentComplete: z.number().int().min(0).max(100),
  plannedLaborMinutes: z.number().int().nonnegative(),
  actualLaborMinutes: z.number().int().nonnegative(),
  status: projectScheduleTaskStatusSchema,
  commitmentWeek: calendarDateSchema.nullable(),
  commitmentStatus: projectScheduleCommitmentStatusSchema,
  constraintReason: z.string().max(2000),
  ownerId: z.string().uuid().nullable(),
  source: projectScheduleSourceSchema,
  version: z.number().int().min(1),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict()

export const projectScheduleSummarySchema = z.object({
  plannedLaborMinutes: z.number().int().nonnegative(),
  actualLaborMinutes: z.number().int().nonnegative(),
  laborVarianceMinutes: z.number().int(),
  averagePercentComplete: z.number().min(0).max(100),
  committedCount: z.number().int().nonnegative(),
  notDoneCount: z.number().int().nonnegative(),
}).strict()

export const projectScheduleListResultSchema = z.object({
  projectId: z.string().uuid(),
  rows: z.array(projectScheduleTaskRowSchema),
  summary: projectScheduleSummarySchema,
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().positive(),
}).strict()

export const projectScheduleCreateResultSchema = z.object({
  projectId: z.string().uuid(),
  created: z.boolean(),
  changed: z.boolean(),
  task: projectScheduleTaskRowSchema,
}).strict()

export const projectScheduleMutationResultSchema = z.object({
  projectId: z.string().uuid(),
  changed: z.boolean(),
  task: projectScheduleTaskRowSchema,
}).strict()

export const importLegacyProjectScheduleResultSchema = z.object({
  projectId: z.string().uuid(),
  sourceScheduleId: z.string().uuid(),
  created: z.boolean(),
  changed: z.boolean(),
  rows: z.array(projectScheduleTaskRowSchema).min(1).max(1000),
}).strict()

export type ImportLegacyProjectScheduleCommand = z.infer<typeof importLegacyProjectScheduleCommandSchema>
export type ImportLegacyProjectScheduleResult = z.infer<typeof importLegacyProjectScheduleResultSchema>

export type ProjectScheduleLevel = z.infer<typeof projectScheduleLevelSchema>
export type ProjectScheduleTaskStatus = z.infer<typeof projectScheduleTaskStatusSchema>
export type ProjectScheduleCommitmentStatus = z.infer<typeof projectScheduleCommitmentStatusSchema>
export type ProjectScheduleSource = z.infer<typeof projectScheduleSourceSchema>
export type ProjectScheduleListQuery = z.infer<typeof projectScheduleListQuerySchema>
export type CreateProjectScheduleTaskCommand = z.infer<typeof createProjectScheduleTaskCommandSchema>
export type UpdateProjectScheduleTaskCommand = z.infer<typeof updateProjectScheduleTaskCommandSchema>
export type ProjectScheduleTaskStatusCommand = z.infer<typeof projectScheduleTaskStatusCommandSchema>
export type ProjectScheduleTaskRow = z.infer<typeof projectScheduleTaskRowSchema>
export type ProjectScheduleListResult = z.infer<typeof projectScheduleListResultSchema>
export type ProjectScheduleCreateResult = z.infer<typeof projectScheduleCreateResultSchema>
export type ProjectScheduleMutationResult = z.infer<typeof projectScheduleMutationResultSchema>
