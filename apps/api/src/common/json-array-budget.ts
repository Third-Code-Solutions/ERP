import type { NextFunction, Request, Response } from 'express'

// Added for zod 3, which recorded one issue per failing array element and did
// not stop at `.max()` (GHSA-mrhx-c7xc-m3w5). zod 4.6.7 is patched; the budget
// stays as a cheap cap that runs before guards and pipes. The largest legitimate
// request carries 5,000 rows (TAKEOFF_IMPORT_MAX_ROWS) plus a few small arrays.
export const MAX_JSON_ARRAY_ELEMENTS = 20_000

/** Total elements across every array in a parsed JSON value. Stops counting past `limit`. */
export function countJsonArrayElements(value: unknown, limit: number): number {
  let total = 0
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (current === null || typeof current !== 'object') continue
    const children = Array.isArray(current) ? current : Object.values(current)
    if (Array.isArray(current)) {
      total += current.length
      if (total > limit) return total
    }
    for (const child of children) {
      if (child !== null && typeof child === 'object') pending.push(child)
    }
  }
  return total
}

/** Rejects JSON bodies whose arrays hold more than `limit` elements, before guards and pipes run. */
export function rejectOversizedJsonArrays(limit = MAX_JSON_ARRAY_ELEMENTS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (countJsonArrayElements(req.body, limit) > limit) {
      res.status(413).json({
        statusCode: 413,
        message: 'Request body contains too many array elements',
      })
      return
    }
    next()
  }
}
