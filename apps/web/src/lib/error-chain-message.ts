/**
 * Message of an error joined with the messages of every nested `cause`.
 *
 * Drizzle wraps driver errors in a `DrizzleQueryError` whose own message is
 * "Failed query: <sql>"; the database's rule text ("Fiscal period is already
 * closed") is on `.cause`. Matching only `error.message` hides every database
 * rule from the user behind a generic failure.
 */
export function errorChainMessage(error: unknown): string {
  const messages: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    messages.push(current.message)
    current = current.cause
  }
  return messages.join('\n')
}
