const MANILA_DATE_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  dateStyle: 'medium',
  timeStyle: 'short',
})

/** "site_ready" → "Site ready". */
export function humanizeToken(value: string): string {
  const spaced = value.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value !== 'string') return null
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : MANILA_DATE_TIME.format(date)
  }
  return /^[a-z]+(_[a-z]+)*$/.test(value) ? humanizeToken(value) : value
}

/** Plain-language summary of an audit diff for activity lists: ids and nested objects are left out. */
export function summarizeAuditDiff(diff: unknown, maxParts = 2): string {
  if (!diff || typeof diff !== 'object' || Array.isArray(diff)) return '—'
  const parts: string[] = []
  for (const [key, raw] of Object.entries(diff as Record<string, unknown>)) {
    if (parts.length >= maxParts) break
    if (key === 'id' || key.endsWith('_id') || key.endsWith('Id')) continue
    const label = humanizeToken(key)
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'after' in raw) {
      const { before, after } = raw as { before?: unknown; after?: unknown }
      const from = formatValue(before)
      const to = formatValue(after)
      if (to !== null) parts.push(from !== null && before !== undefined ? `${label}: ${from} → ${to}` : `${label}: ${to}`)
      continue
    }
    const value = formatValue(raw)
    if (value !== null) parts.push(`${label}: ${value}`)
  }
  return parts.length ? parts.join(' · ') : '—'
}
