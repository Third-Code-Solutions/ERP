export const CORTEX_CITATIONS_HEADER = 'X-Cortex-Citations'

export interface NavigableCortexCitation {
  nodeId: string
  nodeType: string
  refTable: string
  refId: string
  title: string | null
  projectId: string | null
}

const MAX_HEADER_CITATIONS = 8
const MAX_HEADER_LENGTH = 6_000
const MAX_HEADER_TITLE_CODE_POINTS = 80
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SAFE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,99}$/i

function normalizeCitation(value: unknown): NavigableCortexCitation | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<NavigableCortexCitation>
  if (
    typeof candidate.nodeId !== 'string' ||
    !UUID_PATTERN.test(candidate.nodeId) ||
    typeof candidate.nodeType !== 'string' ||
    !SAFE_NAME_PATTERN.test(candidate.nodeType) ||
    typeof candidate.refTable !== 'string' ||
    !SAFE_NAME_PATTERN.test(candidate.refTable) ||
    typeof candidate.refId !== 'string' ||
    !UUID_PATTERN.test(candidate.refId) ||
    (candidate.title !== undefined &&
      candidate.title !== null &&
      typeof candidate.title !== 'string') ||
    (candidate.projectId !== undefined &&
      candidate.projectId !== null &&
      (typeof candidate.projectId !== 'string' ||
        !UUID_PATTERN.test(candidate.projectId)))
  ) {
    return null
  }

  return {
    nodeId: candidate.nodeId,
    nodeType: candidate.nodeType,
    refTable: candidate.refTable,
    refId: candidate.refId,
    title: candidate.title ?? null,
    projectId: candidate.projectId ?? null,
  }
}

export function normalizeCortexCitations(
  value: unknown,
  limit = 12
): NavigableCortexCitation[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeCitation)
    .filter((citation): citation is NavigableCortexCitation =>
      Boolean(citation)
    )
    .slice(0, Math.max(0, limit))
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value: string): string {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (character) =>
    character.charCodeAt(0)
  )
  return new TextDecoder().decode(bytes)
}

export function encodeCortexCitationHeader(value: unknown): string {
  const citations = normalizeCortexCitations(
    value,
    MAX_HEADER_CITATIONS
  ).map((citation) => ({
    ...citation,
    title:
      citation.title === null
        ? null
        : [...citation.title]
            .slice(0, MAX_HEADER_TITLE_CODE_POINTS)
            .join(''),
  }))
  return citations.length > 0
    ? toBase64Url(JSON.stringify(citations))
    : ''
}

export function decodeCortexCitationHeader(
  value: string | null
): NavigableCortexCitation[] {
  if (!value || value.length > MAX_HEADER_LENGTH) return []
  try {
    return normalizeCortexCitations(
      JSON.parse(fromBase64Url(value)),
      MAX_HEADER_CITATIONS
    )
  } catch {
    return []
  }
}
