/**
 * Message of an error joined with the messages of every nested `cause`.
 *
 * Drizzle wraps driver errors in a `DrizzleQueryError` whose own message is
 * "Failed query: <sql>"; the database's rule text ("Fiscal period is already
 * closed") is on `.cause`. Matching only `error.message` hides every database
 * rule from the user behind a generic failure.
 *
 * The wrapper itself is left out: its "params:" line holds values the user typed,
 * which must not choose the message. Match known messages against the result;
 * never return it to a user.
 */
export function errorChainMessage(error: unknown): string {
  return errorChain(error)
    .filter((link) => !link.message.trimStart().startsWith('Failed query:'))
    .map((link) => link.message)
    .join('\n')
}

/**
 * Postgres SQLSTATE (for example "23505" unique violation) of the first error
 * in the cause chain that carries one; Drizzle keeps the driver error on `.cause`.
 */
export function errorChainSqlState(error: unknown): string | undefined {
  for (const link of errorChain(error)) {
    const code = (link as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
  }
  return undefined
}

function errorChain(error: unknown): Error[] {
  const chain: Error[] = []
  let current: unknown = error
  while (current instanceof Error && !chain.includes(current)) {
    chain.push(current)
    current = current.cause
  }
  return chain
}
