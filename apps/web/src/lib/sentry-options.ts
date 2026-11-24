import { sentryErrorsOnlyOptions } from '@third-code-erp/shared-types/sentry-privacy'

/**
 * Sentry options for the browser, Node.js and Edge runtimes; null without a
 * DSN. Read env vars literally so Next.js inlines the public ones into the
 * browser bundle. The release (APP_REVISION) is injected at build time by
 * withSentryConfig in next.config.ts, for browser and server alike.
 */
export function sentryOptions() {
  return sentryErrorsOnlyOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ||
      process.env.VERCEL_ENV ||
      process.env.NODE_ENV,
  })
}
