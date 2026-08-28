export const PLATFORM_DEMO_REQUEST_STATUSES = [
  'new',
  'contacted',
  'demo_scheduled',
  'converted',
  'declined',
] as const

export type PlatformDemoRequestStatus =
  (typeof PLATFORM_DEMO_REQUEST_STATUSES)[number]

export function formatDemoRequestStatus(status: string): string {
  return status.replaceAll('_', ' ')
}
