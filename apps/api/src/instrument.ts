import * as Sentry from '@sentry/nestjs'
import { sentryErrorsOnlyOptions } from '@third-code-erp/shared-types/sentry-privacy'

// Imported first by main.ts so the SDK is ready before Nest and its
// dependencies load. Without SENTRY_DSN nothing is initialised. The DSN
// format is validated by the environment schema when the app module boots.
const options = sentryErrorsOnlyOptions({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.APP_REVISION,
})
if (options) {
  Sentry.init({
    ...options,
    integrations: (defaults) => [
      ...options
        .integrations(defaults)
        .filter(({ name }) => name !== 'Http' && name !== 'OnUnhandledRejection'),
      // No session per incoming request: errors only.
      Sentry.httpIntegration({ sessions: false }),
      // Keep Node's default: an unhandled rejection still exits the process so
      // Railway restarts it. The SDK's default 'warn' mode would keep it alive.
      Sentry.onUnhandledRejectionIntegration({ mode: 'strict' }),
    ],
  })
}
