import { z } from 'zod'
import {
  purchaseOrderWorkflowActionSchema,
  purchaseOrderWorkflowStatusSchema,
} from './purchase-orders'

export const createRfqCommandSchema = z
  .object({
    bomId: z.string().uuid(),
  })
  .strict()

export const rfqCreationResultSchema = z
  .object({
    rfqId: z.string().uuid(),
    tenantId: z.string().uuid(),
    projectId: z.string().uuid(),
    lineCount: z.number().int().safe().nonnegative(),
    created: z.boolean(),
  })
  .strict()

export const rfqDispatchResultSchema = z
  .object({
    jobId: z.string().min(1).max(200),
    enqueued: z.boolean(),
  })
  .strict()

export const rfqDispatchJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: z.string().uuid(),
    actorId: z.string().uuid(),
    bomId: z.string().uuid(),
    source: z.literal('bom_approved'),
  })
  .strict()

export const rfqDispatchDeadLetterSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceJobId: z.string().min(1).max(200),
    sourceJobName: z.string().min(1).max(100),
    jobData: z.unknown(),
    attemptsMade: z.number().int().safe().positive(),
    errorName: z.string().min(1).max(100),
    errorMessage: z.string().min(1).max(1_000),
    failedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const notificationDeliveryJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: z.string().uuid(),
    outboxId: z.string().uuid(),
    deliveryId: z.string().uuid(),
  })
  .strict()

export const purchaseOrderSupplierEmailDeliveryJobSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: z.string().uuid(),
    outboxId: z.string().uuid(),
    deliveryId: z.string().uuid(),
  })
  .strict()

export const notificationSweepJobSchema = z
  .object({
    schemaVersion: z.literal(1),
  })
  .strict()

export const notificationDeliveryResultSchema = z
  .object({
    deliveryId: z.string().uuid(),
    status: z.enum([
      'delivered',
      'already_delivered',
      'already_processing',
      'dead_letter',
    ]),
  })
  .strict()

export const purchaseOrderWorkflowNotificationPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    purchase_order_id: z.string().uuid(),
    action: purchaseOrderWorkflowActionSchema,
    from_status: purchaseOrderWorkflowStatusSchema,
    to_status: purchaseOrderWorkflowStatusSchema,
  })
  .strict()

export const logRfqQuoteCommandSchema = z
  .object({
    submissionId: z.string().uuid(),
    bomLineItemId: z.string().uuid(),
    vendorId: z.string().uuid(),
    unitPriceCents: z.number().int().safe().nonnegative(),
    leadTimeDays: z.number().int().nonnegative().max(3_650).optional(),
    validUntil: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2_000).optional(),
  })
  .strict()

export const rfqQuoteResultSchema = z
  .object({
    quoteId: z.string().uuid(),
    created: z.boolean(),
    statusChanged: z.boolean(),
  })
  .strict()

export const transitionRfqCommandSchema = z.discriminatedUnion(
  'command',
  [
    z
      .object({
        command: z.literal('complete'),
      })
      .strict(),
    z
      .object({
        command: z.literal('cancel'),
        reason: z.string().trim().min(1).max(1_000),
      })
      .strict(),
  ]
)

export const rfqTransitionResultSchema = z
  .object({
    rfqId: z.string().uuid(),
    tenantId: z.string().uuid(),
    transitioned: z.literal(true),
  })
  .strict()

export type LogRfqQuoteCommand = z.infer<
  typeof logRfqQuoteCommandSchema
>
export type CreateRfqCommand = z.infer<
  typeof createRfqCommandSchema
>
export type RfqCreationResult = z.infer<
  typeof rfqCreationResultSchema
>
export type RfqDispatchResult = z.infer<
  typeof rfqDispatchResultSchema
>
export type RfqDispatchJob = z.infer<
  typeof rfqDispatchJobSchema
>
export type RfqDispatchDeadLetter = z.infer<
  typeof rfqDispatchDeadLetterSchema
>
export type NotificationDeliveryJob = z.infer<
  typeof notificationDeliveryJobSchema
>
export type PurchaseOrderSupplierEmailDeliveryJob = z.infer<
  typeof purchaseOrderSupplierEmailDeliveryJobSchema
>
export type NotificationSweepJob = z.infer<
  typeof notificationSweepJobSchema
>
export type NotificationDeliveryResult = z.infer<
  typeof notificationDeliveryResultSchema
>
export type PurchaseOrderWorkflowNotificationPayload = z.infer<
  typeof purchaseOrderWorkflowNotificationPayloadSchema
>
export type RfqQuoteResult = z.infer<typeof rfqQuoteResultSchema>
export type TransitionRfqCommand = z.infer<
  typeof transitionRfqCommandSchema
>
export type RfqTransitionResult = z.infer<
  typeof rfqTransitionResultSchema
>
