import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/sentry-options'

// Runs once per server instance. Only the Node.js runtime reports: the Edge
// runtime (middleware) has no verified per-request scope isolation, so its
// breadcrumbs could mix across requests and tenants. Without a DSN, or on
// Edge, the SDK is never initialised and onRequestError sends nothing.
export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const options = sentryOptions()
  if (options) Sentry.init(options)
}

// Server Component, Route Handler and Server Action errors.
export const onRequestError = Sentry.captureRequestError
