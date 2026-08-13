const DEFAULT_PUBLIC_ORIGIN = 'http://localhost:3000'

type PublicOriginEnvironment = {
  NEXT_PUBLIC_SITE_URL?: string
  SITE_URL?: string
  VERCEL_PROJECT_PRODUCTION_URL?: string
}

function parseOrigin(
  rawValue: string,
  variableName: keyof PublicOriginEnvironment,
  allowHostnameOnly = false
): URL {
  const value = rawValue.trim()
  const normalized =
    allowHostnameOnly && !/^https?:\/\//i.test(value)
      ? `https://${value}`
      : value

  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error(
      `[ABI OPS] Invalid ${variableName}: expected an absolute HTTP(S) origin.`
    )
  }

  const hasUnexpectedParts =
    !['http:', 'https:'].includes(url.protocol) ||
    Boolean(url.username || url.password) ||
    url.pathname !== '/' ||
    Boolean(url.search || url.hash)

  if (hasUnexpectedParts) {
    throw new Error(
      `[ABI OPS] Invalid ${variableName}: expected an absolute HTTP(S) origin without credentials, path, query, or fragment.`
    )
  }

  return new URL(url.origin)
}

export function resolvePublicOrigin(
  environment: PublicOriginEnvironment = {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    SITE_URL: process.env.SITE_URL,
    VERCEL_PROJECT_PRODUCTION_URL:
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
  }
): URL {
  if (environment.NEXT_PUBLIC_SITE_URL?.trim()) {
    return parseOrigin(
      environment.NEXT_PUBLIC_SITE_URL,
      'NEXT_PUBLIC_SITE_URL'
    )
  }

  if (environment.SITE_URL?.trim()) {
    return parseOrigin(environment.SITE_URL, 'SITE_URL')
  }

  if (environment.VERCEL_PROJECT_PRODUCTION_URL?.trim()) {
    return parseOrigin(
      environment.VERCEL_PROJECT_PRODUCTION_URL,
      'VERCEL_PROJECT_PRODUCTION_URL',
      true
    )
  }

  return new URL(DEFAULT_PUBLIC_ORIGIN)
}

export function publicUrl(pathname: string): string {
  return new URL(pathname, resolvePublicOrigin()).toString()
}
