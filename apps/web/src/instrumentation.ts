import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/sentry-options'

// Runs once per server instance. Only the Node.js runtime reports: the Edge
// runtime (middleware) has no verified per-request scope isolation, so its
// breadcrumbs could mix across requests and tenants. Without a DSN, or on
// Edge, the SDK is never initialised and onRequestError sends nothing.
// The runtime check wraps the init so the Edge build, which has no
// httpIntegration, drops that code.
export function register(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const options = sentryOptions()
    if (options) {
      Sentry.init({
        ...options,
        integrations: (defaults) => [
          ...options.integrations(defaults).filter(({ name }) => name !== 'Http'),
          // Next.js's own Http default (it traces incoming requests itself),
          // without a session per incoming request.
          Sentry.httpIntegration({ disableIncomingRequestSpans: true, sessions: false }),
        ],
      })
    }
  }
}

// Server Component, Route Handler and Server Action errors.
export const onRequestError = Sentry.captureRequestError
