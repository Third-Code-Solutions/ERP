// Uses globalThis.crypto (Web Crypto API — available in Node.js 18+ and browsers)

export interface AuditEntry {
  id: number
  prev_hash: string
  hash: string
  entity_type: string
  entity_id: string
  action: string
  diff: Record<string, unknown> | null
  created_at: Date
}

/**
 * Matches public.audit_log_trigger() exactly. PostgreSQL renders a UTC
 * timestamptz without a trailing zero fraction, so normalize the millisecond
 * Date representation before hashing. Keep this separate from computeHash,
 * which remains the generic JSON hash utility.
 */
function postgresTimestampText(value: Date): string {
  const iso = value.toISOString()
  const [date, timeWithZone] = iso.split('T')
  if (!date || !timeWithZone) {
    throw new Error('Invalid audit timestamp')
  }
  const time = timeWithZone.replace('Z', '')
  const [clock, fraction = ''] = time.split('.')
  const trimmedFraction = fraction.replace(/0+$/, '')
  return `${date} ${clock}${trimmedFraction ? `.${trimmedFraction}` : ''}+00`
}

export async function computeDatabaseAuditHash(
  prevHash: string,
  row: Pick<AuditEntry, 'entity_type' | 'entity_id' | 'action' | 'created_at'>
): Promise<string> {
  const input =
    prevHash +
    row.entity_type +
    row.entity_id +
    row.action +
    postgresTimestampText(row.created_at)
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Generic JSON SHA256 helper retained for non-database consumers. Audit-log
// writers and verification must use computeDatabaseAuditHash below.
export async function computeHash(
  prevHash: string,
  rowContent: Record<string, unknown>
): Promise<string> {
  const input = JSON.stringify({ prev: prevHash, ...rowContent })
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface ChainVerificationResult {
  valid: boolean
  firstInvalidId?: number
  checkedCount: number
  error?: string
}

// Verify the entire hash chain is intact
export async function verifyHashChain(entries: AuditEntry[]): Promise<ChainVerificationResult> {
  if (entries.length === 0) {
    return { valid: true, checkedCount: 0 }
  }

  const sorted = [...entries].sort((a, b) => a.id - b.id)

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]
    if (!entry) continue

    const prevEntry = i === 0 ? null : sorted[i - 1]
    const prevHash = prevEntry ? prevEntry.hash : 'genesis'

    if (entry.prev_hash !== prevHash) {
      return {
        valid: false,
        firstInvalidId: entry.id,
        checkedCount: i,
        error: `Hash chain broken at entry ${entry.id}: prev_hash mismatch`,
      }
    }

    const expectedHash = await computeDatabaseAuditHash(prevHash, {
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      created_at: entry.created_at,
    })

    if (entry.hash !== expectedHash) {
      return {
        valid: false,
        firstInvalidId: entry.id,
        checkedCount: i,
        error: `Hash mismatch at entry ${entry.id}`,
      }
    }
  }

  return { valid: true, checkedCount: sorted.length }
}

// Compute a diff between two states of an object
export function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {}
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    const beforeVal = before[key]
    const afterVal = after[key]
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      diff[key] = { before: beforeVal, after: afterVal }
    }
  }

  return diff
}
