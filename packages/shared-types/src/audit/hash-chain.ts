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

// Compute SHA256 hash for an audit log entry
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

    const expectedHash = await computeHash(prevHash, {
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      diff: entry.diff,
      created_at: entry.created_at.toISOString(),
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
