/**
 * Flatten URL or Next search params into a plain record for schema validation.
 * Blank values (an untouched form field) are dropped; a repeated key becomes an
 * array so a strict string schema rejects it instead of silently taking one.
 */
export function paramsRecord(
  entries: Iterable<readonly [string, string | string[] | undefined]>
): Record<string, string | string[]> {
  const grouped = new Map<string, string[]>()
  for (const [key, value] of entries) {
    const candidates: Array<string | undefined> = Array.isArray(value)
      ? value
      : [value]
    const values = candidates.filter(
      (item): item is string => item !== undefined && item !== ''
    )
    if (values.length === 0) continue
    grouped.set(key, [...(grouped.get(key) ?? []), ...values])
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([key, values]) => [key, singleOrList(values)])
  )
}

function singleOrList(values: string[]): string | string[] {
  const [first] = values
  return values.length === 1 && first !== undefined ? first : values
}
