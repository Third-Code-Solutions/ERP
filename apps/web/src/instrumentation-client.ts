import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/sentry-options'

// Browser error monitoring. NEXT_PUBLIC_SENTRY_DSN is inlined at build time;
// an unset DSN leaves the SDK uninitialised.
const options = sentryOptions()
if (options) Sentry.init(options)
