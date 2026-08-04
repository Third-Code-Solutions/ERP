/**
 * Cortex responses contain tenant- and role-scoped state. Keep every response
 * private and prevent a browser or intermediary from reusing it after session
 * authorization changes.
 */
export const CORTEX_PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
} as const
