export type AuthRuntime = {
  apiUrl: string
  databaseUrl: string
  serviceRoleKey: string
}

type AuthRuntimeEnvironment = Record<string, string | undefined>

const PLACEHOLDER_MARKERS = [
  'placeholder',
  'changeme',
  'change-me',
  'example',
  'replace-me',
  'dummy',
]

function isLoopbackUrl(
  value: string,
  protocols: readonly string[],
  options: { allowCredentials?: boolean; requireRootPath?: boolean } = {}
): boolean {
  try {
    const url = new URL(value)
    const hostIsLoopback =
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '::1'

    return (
      protocols.includes(url.protocol) &&
      hostIsLoopback &&
      (options.allowCredentials || (!url.username && !url.password)) &&
      (!options.requireRootPath || url.pathname === '/') &&
      !url.search &&
      !url.hash
    )
  } catch {
    return false
  }
}

function requireRuntimeValue(
  environment: AuthRuntimeEnvironment,
  key: string
): string {
  const value = environment[key]?.trim()
  if (!value) {
    throw new Error(
      `ADR-030 Auth API proof requires explicit ${key} from the running local Supabase stack`
    )
  }

  return value
}

function requireNonPlaceholder(value: string, key: string): string {
  const normalized = value.toLowerCase()
  if (
    value.length < 32 ||
    PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker))
  ) {
    throw new Error(
      `ADR-030 Auth API proof rejects a placeholder or malformed ${key}`
    )
  }

  return value
}

export function resolveAuthRuntime(
  environment: AuthRuntimeEnvironment = process.env
): AuthRuntime {
  const apiUrl = requireRuntimeValue(environment, 'SUPABASE_AUTH_API_URL')
  if (!isLoopbackUrl(apiUrl, ['http:', 'https:'], { requireRootPath: true })) {
    throw new Error(
      'ADR-030 Auth API proof accepts only an explicit disposable loopback SUPABASE_AUTH_API_URL'
    )
  }

  const databaseUrl = requireRuntimeValue(environment, 'DATABASE_URL')
  if (
    !isLoopbackUrl(databaseUrl, ['postgres:', 'postgresql:'], {
      allowCredentials: true,
    })
  ) {
    throw new Error(
      'ADR-030 Auth API proof accepts only an explicit disposable loopback DATABASE_URL'
    )
  }

  const serviceRoleKey = requireNonPlaceholder(
    requireRuntimeValue(environment, 'SUPABASE_SERVICE_ROLE_KEY'),
    'SUPABASE_SERVICE_ROLE_KEY'
  )

  return { apiUrl, databaseUrl, serviceRoleKey }
}
