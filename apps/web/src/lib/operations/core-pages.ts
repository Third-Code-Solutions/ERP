interface CorePageResult<D> {
  ok: boolean
  error?: string | null
  data?: D | null
}

/**
 * Reads every page of a paged Core list so totals derived from rows stay
 * complete. Throws `failure` (or Core's error) when any page cannot be read.
 */
export async function readAllCorePages<D extends { rows: unknown[]; total: number }>(
  read: (page: number) => Promise<CorePageResult<D>>,
  failure: string,
  maxPages = 20,
): Promise<D> {
  const first = await read(1)
  if (!first.ok || !first.data) throw new Error(first.error ?? failure)
  const rows = [...first.data.rows]
  for (let page = 2; rows.length < first.data.total; page += 1) {
    if (page > maxPages) throw new Error(`${failure} The list is longer than ${maxPages} pages.`)
    const next = await read(page)
    if (!next.ok || !next.data) throw new Error(next.error ?? failure)
    if (next.data.rows.length === 0) break
    rows.push(...next.data.rows)
  }
  return { ...first.data, rows } as D
}
