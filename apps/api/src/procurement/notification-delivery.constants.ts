export const NOTIFICATION_DELIVERY_QUEUE = 'notification-delivery'
export const NOTIFICATION_DELIVERY_JOB = 'deliver-notification'
export const NOTIFICATION_SWEEP_JOB =
  'sweep-notification-outbox'
export const NOTIFICATION_SWEEP_SCHEDULER =
  'notification-outbox-sweep-v1'
export const NOTIFICATION_SWEEP_INTERVAL_MS = 60_000
export const NOTIFICATION_DELIVERY_ATTEMPTS = 5
export const NOTIFICATION_DELIVERY_BACKOFF_MS = 1_000

export function notificationDeliveryJobId(
  deliveryId: string
): string {
  return `notification1-${deliveryId}`
}
