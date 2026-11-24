import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/sentry-options'

// Runs once per Node.js / Edge server instance. Without a DSN the SDK is never
// initialised, so onRequestError below has no client and sends nothing.
export function register(): void {
  const options = sentryOptions()
  if (options) Sentry.init(options)
}

// Server Component, Route Handler, Server Action and middleware errors.
export const onRequestError = Sentry.captureRequestError
