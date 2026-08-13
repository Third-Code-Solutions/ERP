import { z } from 'zod'

import {
  type BusinessDayService,
  philippineBusinessDays,
} from '../business-days'

export const SLA_THRESHOLDS = Object.freeze({
  at_risk_pct: 80,
  breach_pct: 100,
  escalation_pct: 150,
})

export const DEFAULT_SLA_TIME_ZONE = 'Asia/Manila'

export const slaClockTypeSchema = z.enum(['business_days', 'calendar_hours'])
export const slaClockScopeSchema = z.enum(['internal', 'external'])

export const slaClockDefinitionSchema = z.object({
  clock_type: slaClockTypeSchema,
  clock_scope: slaClockScopeSchema,
  target_value: z.number().int().positive(),
  started_at: z.date(),
  observe_mode: z.boolean().default(true),
  time_zone: z.string().min(1).default(DEFAULT_SLA_TIME_ZONE),
})

const apiUuidSchema = z.string().uuid()
const apiDateTimeSchema = z.string().datetime({ offset: true })

export const createProcessStepCommandSchema = z
  .object({
    code: z.string().trim().min(1).max(64),
    stage: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(255),
    responsibleBu: z.string().trim().min(1).max(120),
    input: z.string().trim().min(1),
    inputFrom: z.string().trim().min(1),
    output: z.string().trim().min(1),
    outputBy: z.string().trim().min(1),
    slaDays: z.number().int().positive().max(3_650).optional(),
    slaHours: z.number().int().positive().max(87_600).optional(),
    isBusinessDays: z.boolean().default(true),
    clockScope: slaClockScopeSchema.default('internal'),
    templateLink: z.string().trim().max(512).nullable().optional(),
    predecessorCode: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.responsibleBu.includes('?')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['responsibleBu'],
        message: 'Process-step owner must be resolved before creation',
      })
    }

    if (
      value.isBusinessDays &&
      (value.slaDays === undefined || value.slaHours !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slaDays'],
        message: 'Business-day steps require slaDays and forbid slaHours',
      })
    }

    if (
      !value.isBusinessDays &&
      (value.slaHours === undefined || value.slaDays !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['slaHours'],
        message: 'Calendar-hour steps require slaHours and forbid slaDays',
      })
    }
  })

export const processStepResultSchema = z
  .object({
    id: apiUuidSchema,
    tenantId: apiUuidSchema,
    code: z.string(),
    stage: z.string(),
    name: z.string(),
    responsibleBu: z.string(),
    input: z.string(),
    inputFrom: z.string(),
    output: z.string(),
    outputBy: z.string(),
    slaDays: z.number().int().nullable(),
    slaHours: z.number().int().nullable(),
    isBusinessDays: z.boolean(),
    clockScope: slaClockScopeSchema,
    templateLink: z.string().nullable(),
    predecessorCode: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: apiDateTimeSchema,
    updatedAt: apiDateTimeSchema,
  })
  .strict()

export const createTaskInstanceCommandSchema = z
  .object({
    processStepId: apiUuidSchema,
    subjectType: z.string().trim().min(1).max(64),
    subjectId: apiUuidSchema,
    instanceKey: z.string().trim().min(1).max(255),
    assignedTo: apiUuidSchema.nullable().optional(),
  })
  .strict()

export const assignTaskInstanceCommandSchema = z
  .object({
    assignedTo: apiUuidSchema.nullable(),
  })
  .strict()

export const updateTaskStatusCommandSchema = z
  .object({
    status: z.enum(['in_progress', 'blocked', 'completed', 'cancelled']),
    blockedReason: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'blocked' && !value.blockedReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockedReason'],
        message: 'Blocked tasks require a reason',
      })
    }
    if (value.status !== 'blocked' && value.blockedReason !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockedReason'],
        message: 'Blocked reason is only valid for blocked tasks',
      })
    }
  })

export const taskInstanceResultSchema = z
  .object({
    id: apiUuidSchema,
    tenantId: apiUuidSchema,
    processStepId: apiUuidSchema,
    subjectType: z.string(),
    subjectId: apiUuidSchema,
    instanceKey: z.string(),
    assignedTo: apiUuidSchema.nullable(),
    status: z.enum([
      'pending',
      'in_progress',
      'blocked',
      'completed',
      'cancelled',
    ]),
    blockedReason: z.string().nullable(),
    startedAt: apiDateTimeSchema.nullable(),
    completedAt: apiDateTimeSchema.nullable(),
    createdAt: apiDateTimeSchema,
    updatedAt: apiDateTimeSchema,
  })
  .strict()

export const startProcessClockCommandSchema = z
  .object({
    startedAt: apiDateTimeSchema.optional(),
    observeMode: z.boolean().default(true),
    timeZone: z.string().trim().min(1).max(80).default(DEFAULT_SLA_TIME_ZONE),
  })
  .strict()

export const evaluateSlaClockCommandSchema = z
  .object({
    now: apiDateTimeSchema.optional(),
  })
  .strict()

export const setSlaObserveModeCommandSchema = z
  .object({
    observeMode: z.boolean(),
  })
  .strict()

export const slaClockResultSchema = z
  .object({
    id: apiUuidSchema,
    tenantId: apiUuidSchema,
    taskInstanceId: apiUuidSchema,
    clockType: slaClockTypeSchema,
    clockScope: slaClockScopeSchema,
    targetValue: z.number().int().positive(),
    startedAt: apiDateTimeSchema,
    dueAt: apiDateTimeSchema,
    atRiskAt: apiDateTimeSchema,
    escalationAt: apiDateTimeSchema.nullable(),
    breachedAt: apiDateTimeSchema.nullable(),
    escalatedAt: apiDateTimeSchema.nullable(),
    pausedReason: z.string().nullable(),
    status: z.enum([
      'running',
      'paused',
      'breached',
      'escalated',
      'completed',
      'cancelled',
    ]),
    observeMode: z.boolean(),
    phase: z.enum(['running', 'at_risk', 'breached', 'escalation_due']),
    isAtRisk: z.boolean(),
    isBreached: z.boolean(),
    shouldEscalate: z.boolean(),
    updatedAt: apiDateTimeSchema,
  })
  .strict()

export const processHealthByBuSchema = z
  .object({
    responsibleBu: z.string(),
    openTasks: z.number().int().nonnegative(),
    atRiskClocks: z.number().int().nonnegative(),
    breachedClocks: z.number().int().nonnegative(),
    escalatedClocks: z.number().int().nonnegative(),
    externalBreachedClocks: z.number().int().nonnegative(),
  })
  .strict()

export const processHealthResultSchema = z
  .object({
    tenantId: apiUuidSchema,
    observeMode: z.boolean(),
    byBu: z.array(processHealthByBuSchema),
    generatedAt: apiDateTimeSchema,
  })
  .strict()

export const listApprovalRulesQuerySchema = z
  .object({
    objectType: z.string().trim().min(1).max(64).optional(),
  })
  .strict()

const centavoStringSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, 'Use non-negative integer centavos')
  .max(18)

export const createApprovalRuleCommandSchema = z
  .object({
    objectType: z.string().trim().min(1).max(64),
    amountBandLow: centavoStringSchema,
    amountBandHigh: centavoStringSchema.nullable().optional(),
    approverRole: z.string().trim().min(1).max(80),
    sequence: z.number().int().positive().max(100),
    escalationAfterDays: z.number().int().positive().max(3_650).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.amountBandHigh !== undefined &&
      value.amountBandHigh !== null &&
      BigInt(value.amountBandHigh) < BigInt(value.amountBandLow)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountBandHigh'],
        message: 'Upper amount band must not be below lower amount band',
      })
    }
  })

export const approvalRuleResultSchema = z
  .object({
    id: apiUuidSchema,
    tenantId: apiUuidSchema,
    objectType: z.string(),
    amountBandLow: centavoStringSchema,
    amountBandHigh: centavoStringSchema.nullable(),
    approverRole: z.string(),
    sequence: z.number().int().positive(),
    escalationAfterDays: z.number().int().positive().nullable(),
    isActive: z.boolean(),
    createdAt: apiDateTimeSchema,
    updatedAt: apiDateTimeSchema,
  })
  .strict()

export const createApprovalCommandSchema = z
  .object({
    objectType: z.string().trim().min(1).max(64),
    objectId: apiUuidSchema,
    approvalRuleId: apiUuidSchema,
    sequence: z.number().int().positive().max(100),
    approverUserId: apiUuidSchema.nullable().optional(),
  })
  .strict()

export const decideApprovalCommandSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    decisionNote: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.status === 'rejected' && !value.decisionNote) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decisionNote'],
        message: 'Rejected approvals require a decision note',
      })
    }
  })

export const approvalResultSchema = z
  .object({
    id: apiUuidSchema,
    tenantId: apiUuidSchema,
    objectType: z.string(),
    objectId: apiUuidSchema,
    approvalRuleId: apiUuidSchema,
    sequence: z.number().int().positive(),
    approverUserId: apiUuidSchema.nullable(),
    status: z.enum([
      'pending',
      'approved',
      'rejected',
      'expired',
      'cancelled',
    ]),
    requestedAt: apiDateTimeSchema,
    decidedAt: apiDateTimeSchema.nullable(),
    decisionNote: z.string().nullable(),
    createdAt: apiDateTimeSchema,
    updatedAt: apiDateTimeSchema,
  })
  .strict()

export type CreateProcessStepCommand = z.infer<
  typeof createProcessStepCommandSchema
>
export type ProcessStepResult = z.infer<typeof processStepResultSchema>
export type CreateTaskInstanceCommand = z.infer<
  typeof createTaskInstanceCommandSchema
>
export type AssignTaskInstanceCommand = z.infer<
  typeof assignTaskInstanceCommandSchema
>
export type UpdateTaskStatusCommand = z.infer<
  typeof updateTaskStatusCommandSchema
>
export type TaskInstanceResult = z.infer<typeof taskInstanceResultSchema>
export type StartProcessClockCommand = z.infer<
  typeof startProcessClockCommandSchema
>
export type EvaluateSlaClockCommand = z.infer<
  typeof evaluateSlaClockCommandSchema
>
export type SetSlaObserveModeCommand = z.infer<
  typeof setSlaObserveModeCommandSchema
>
export type SlaClockResult = z.infer<typeof slaClockResultSchema>
export type ProcessHealthResult = z.infer<
  typeof processHealthResultSchema
>
export type ListApprovalRulesQuery = z.infer<
  typeof listApprovalRulesQuerySchema
>
export type CreateApprovalRuleCommand = z.infer<
  typeof createApprovalRuleCommandSchema
>
export type ApprovalRuleResult = z.infer<typeof approvalRuleResultSchema>
export type CreateApprovalCommand = z.infer<
  typeof createApprovalCommandSchema
>
export type DecideApprovalCommand = z.infer<
  typeof decideApprovalCommandSchema
>
export type ApprovalResult = z.infer<typeof approvalResultSchema>

export type SlaClockType = z.infer<typeof slaClockTypeSchema>
export type SlaClockScope = z.infer<typeof slaClockScopeSchema>
export type SlaClockDefinition = z.infer<typeof slaClockDefinitionSchema>
export type SlaClockDefinitionInput = z.input<typeof slaClockDefinitionSchema>

export type SlaClockSchedule = {
  clock_type: SlaClockType
  clock_scope: SlaClockScope
  target_value: number
  observe_mode: boolean
  started_at: Date
  at_risk_at: Date
  due_at: Date
  /** Null for external clocks because they never escalate against a BU. */
  escalation_at: Date | null
}

export type SlaClockPhase = 'running' | 'at_risk' | 'breached' | 'escalation_due'

export type SlaClockEvaluation = {
  phase: SlaClockPhase
  is_at_risk: boolean
  is_breached: boolean
  should_escalate: boolean
  clock_scope: SlaClockScope
  observe_mode: boolean
}

type LocalDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  formatters.set(timeZone, formatter)
  return formatter
}

function requiredNumberPart(
  parts: ReadonlyMap<string, string>,
  name: string
): number {
  const value = parts.get(name)
  const parsed = value === undefined ? Number.NaN : Number(value)
  if (!Number.isInteger(parsed)) {
    throw new RangeError(`Unable to resolve ${name} in SLA time zone`)
  }
  return parsed
}

function localPartsAt(value: Date, timeZone: string): LocalDateTimeParts {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError('SLA clock arithmetic requires valid dates')
  }

  const parts = new Map(
    formatterFor(timeZone)
      .formatToParts(value)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value: partValue }) => [type, partValue] as const)
  )

  return {
    year: requiredNumberPart(parts, 'year'),
    month: requiredNumberPart(parts, 'month'),
    day: requiredNumberPart(parts, 'day'),
    hour: requiredNumberPart(parts, 'hour'),
    minute: requiredNumberPart(parts, 'minute'),
    second: requiredNumberPart(parts, 'second'),
  }
}

function isoDateAt(value: Date, timeZone: string): string {
  const parts = localPartsAt(value, timeZone)
  return [parts.year, parts.month, parts.day]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-')
}

/** Convert a local wall-clock value back to an instant without a timezone dependency. */
function instantAtLocalTime(
  date: string,
  reference: Date,
  timeZone: string
): Date {
  const [yearText, monthText, dayText] = date.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (![year, month, day].every(Number.isInteger)) {
    throw new RangeError(`Invalid SLA local date: ${date}`)
  }

  const referenceParts = localPartsAt(reference, timeZone)
  const utcGuess = Date.UTC(
    year,
    month - 1,
    day,
    referenceParts.hour,
    referenceParts.minute,
    referenceParts.second
  )
  const guessedLocalParts = localPartsAt(new Date(utcGuess), timeZone)
  const guessedLocalAsUtc = Date.UTC(
    guessedLocalParts.year,
    guessedLocalParts.month - 1,
    guessedLocalParts.day,
    guessedLocalParts.hour,
    guessedLocalParts.minute,
    guessedLocalParts.second
  )
  const offsetMs = guessedLocalAsUtc - utcGuess
  return new Date(utcGuess - offsetMs + reference.getUTCMilliseconds())
}

function thresholdBusinessDays(targetValue: number, percentage: number): number {
  return Math.max(1, Math.ceil((targetValue * percentage) / 100))
}

function assertScheduleOrder(schedule: SlaClockSchedule): void {
  if (
    schedule.started_at > schedule.at_risk_at ||
    schedule.at_risk_at > schedule.due_at ||
    (schedule.escalation_at !== null && schedule.due_at > schedule.escalation_at)
  ) {
    throw new RangeError('SLA schedule thresholds are out of order')
  }
}

export function createSlaClockSchedule(
  rawDefinition: SlaClockDefinitionInput,
  businessDays: BusinessDayService = philippineBusinessDays
): SlaClockSchedule {
  const definition = slaClockDefinitionSchema.parse(rawDefinition)
  const { clock_type, clock_scope, target_value, started_at, observe_mode, time_zone } = definition

  if (clock_type === 'calendar_hours') {
    const atRiskAt = businessDays.addCalendarHours(
      started_at,
      (target_value * SLA_THRESHOLDS.at_risk_pct) / 100
    )
    const dueAt = businessDays.addCalendarHours(started_at, target_value)
    const escalationAt =
      clock_scope === 'internal'
        ? businessDays.addCalendarHours(
            started_at,
            (target_value * SLA_THRESHOLDS.escalation_pct) / 100
          )
        : null
    const schedule = {
      clock_type,
      clock_scope,
      target_value,
      observe_mode,
      started_at: new Date(started_at),
      at_risk_at: atRiskAt,
      due_at: dueAt,
      escalation_at: escalationAt,
    }
    assertScheduleOrder(schedule)
    return schedule
  }

  const startDate = isoDateAt(started_at, time_zone)
  const atRiskDate = businessDays.add(
    startDate,
    thresholdBusinessDays(target_value, SLA_THRESHOLDS.at_risk_pct)
  )
  const dueDate = businessDays.add(startDate, target_value)
  const escalationDate = businessDays.add(
    startDate,
    thresholdBusinessDays(target_value, SLA_THRESHOLDS.escalation_pct)
  )
  const schedule = {
    clock_type,
    clock_scope,
    target_value,
    observe_mode,
    started_at: new Date(started_at),
    at_risk_at: instantAtLocalTime(atRiskDate, started_at, time_zone),
    due_at: instantAtLocalTime(dueDate, started_at, time_zone),
    escalation_at:
      clock_scope === 'internal'
        ? instantAtLocalTime(escalationDate, started_at, time_zone)
        : null,
  }
  assertScheduleOrder(schedule)
  return schedule
}

export function evaluateSlaClock(
  schedule: SlaClockSchedule,
  now: Date
): SlaClockEvaluation {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError('SLA evaluation requires a valid current date')
  }

  const isAtRisk = now >= schedule.at_risk_at
  const isBreached = now >= schedule.due_at
  const shouldEscalate =
    schedule.clock_scope === 'internal' &&
    !schedule.observe_mode &&
    schedule.escalation_at !== null &&
    now >= schedule.escalation_at

  return {
    phase: shouldEscalate
      ? 'escalation_due'
      : isBreached
        ? 'breached'
        : isAtRisk
          ? 'at_risk'
          : 'running',
    is_at_risk: isAtRisk,
    is_breached: isBreached,
    should_escalate: shouldEscalate,
    clock_scope: schedule.clock_scope,
    observe_mode: schedule.observe_mode,
  }
}

export function canEscalateSlaClock(
  clockScope: SlaClockScope,
  observeMode: boolean
): boolean {
  return clockScope === 'internal' && !observeMode
}
