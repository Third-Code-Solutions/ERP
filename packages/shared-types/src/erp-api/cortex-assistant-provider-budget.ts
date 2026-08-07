import { z } from 'zod'

export const CORTEX_ASSISTANT_PROVIDER_COST_MICROS_MAX = 999_999_999_999

const positiveCostMicrosSchema = z
  .string()
  .regex(/^[1-9]\d{0,11}$/, 'Cost micros must be a positive bounded integer')
  .refine(
    (value) => {
      const micros = Number(value)
      return (
        Number.isSafeInteger(micros) &&
        micros > 0 &&
        micros <= CORTEX_ASSISTANT_PROVIDER_COST_MICROS_MAX
      )
    },
    'Cost micros exceed the supported bound'
  )

const nonNegativeCostMicrosSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,11})$/, 'Cost micros must be a bounded integer')
  .refine(
    (value) => {
      const micros = Number(value)
      return (
        Number.isSafeInteger(micros) &&
        micros >= 0 &&
        micros <= CORTEX_ASSISTANT_PROVIDER_COST_MICROS_MAX
      )
    },
    'Cost micros exceed the supported bound'
  )

const providerKeySchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Invalid provider key')

const modelKeySchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._:/-]*$/, 'Invalid model key')

const outcomeCodeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9:_-]*$/, 'Invalid outcome code')

export const cortexAssistantProviderReservationCommandSchema = z
  .object({
    jobId: z.string().uuid(),
    attemptNumber: z.number().int().min(1).max(3),
    provider: providerKeySchema,
    model: modelKeySchema,
    maxCostMicros: positiveCostMicrosSchema,
  })
  .strict()

export const cortexAssistantProviderDispatchCommandSchema = z
  .object({ reservationId: z.string().uuid() })
  .strict()

export const cortexAssistantProviderSettlementCommandSchema = z
  .object({
    reservationId: z.string().uuid(),
    consumedCostMicros: nonNegativeCostMicrosSchema,
    outcomeCode: outcomeCodeSchema,
  })
  .strict()

export const cortexAssistantProviderReleaseCommandSchema = z
  .object({
    reservationId: z.string().uuid(),
    outcomeCode: outcomeCodeSchema,
  })
  .strict()

export const cortexAssistantProviderAttemptStatusSchema = z.enum([
  'reserved',
  'dispatched',
  'settled',
  'released',
])

export const cortexAssistantProviderAttemptResultSchema = z
  .object({
    reservationId: z.string().uuid(),
    jobId: z.string().uuid(),
    attemptNumber: z.number().int().min(1).max(3),
    provider: providerKeySchema,
    model: modelKeySchema,
    status: cortexAssistantProviderAttemptStatusSchema,
    reservedCostMicros: positiveCostMicrosSchema,
    consumedCostMicros: nonNegativeCostMicrosSchema.nullable(),
    outcomeCode: outcomeCodeSchema.nullable(),
    budgetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    replayed: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const terminal = value.status === 'settled' || value.status === 'released'
    if (terminal !== (value.outcomeCode !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Terminal attempts require one outcome code',
        path: ['outcomeCode'],
      })
    }
    if (value.status === 'released' && value.consumedCostMicros !== '0') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Released attempts consume zero cost micros',
        path: ['consumedCostMicros'],
      })
    }
    if (value.status === 'settled' && value.consumedCostMicros === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Settled attempts require consumed cost micros',
        path: ['consumedCostMicros'],
      })
    }
    if (
      value.consumedCostMicros !== null &&
      Number(value.consumedCostMicros) > Number(value.reservedCostMicros)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Consumed cost cannot exceed the reservation',
        path: ['consumedCostMicros'],
      })
    }
    if (
      (value.status === 'reserved' || value.status === 'dispatched') &&
      value.consumedCostMicros !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Open attempts cannot report consumed cost',
        path: ['consumedCostMicros'],
      })
    }
  })

export type CortexAssistantProviderReservationCommand = z.infer<
  typeof cortexAssistantProviderReservationCommandSchema
>
export type CortexAssistantProviderDispatchCommand = z.infer<
  typeof cortexAssistantProviderDispatchCommandSchema
>
export type CortexAssistantProviderSettlementCommand = z.infer<
  typeof cortexAssistantProviderSettlementCommandSchema
>
export type CortexAssistantProviderReleaseCommand = z.infer<
  typeof cortexAssistantProviderReleaseCommandSchema
>
export type CortexAssistantProviderAttemptResult = z.infer<
  typeof cortexAssistantProviderAttemptResultSchema
>
