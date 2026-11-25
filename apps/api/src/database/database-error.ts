type ErrorRecord = Record<string, unknown>

function isErrorRecord(value: unknown): value is ErrorRecord {
  return typeof value === 'object' && value !== null
}

/**
 * Drizzle wraps the database driver's error in `cause`, which otherwise hides
 * a reviewed domain constraint from service-level HTTP error mapping.
 */
export function databaseErrorMessage(error: unknown): string {
  const messages: string[] = []
  const visited = new Set<unknown>()
  let current: unknown = error

  while (isErrorRecord(current) && !visited.has(current)) {
    visited.add(current)
    if (typeof current.message === 'string' && current.message.length > 0) {
      messages.push(current.message)
    }
    current = current.cause
  }

  return messages.join('\n')
}

export function databaseErrorCode(error: unknown): string | undefined {
  return driverErrorField(error, 'code')
}

/** Name of the violated constraint, from the same driver error as the code. */
export function databaseErrorConstraint(error: unknown): string | undefined {
  return driverErrorField(error, 'constraint_name')
}

function driverErrorField(error: unknown, field: string): string | undefined {
  const visited = new Set<unknown>()
  let current: unknown = error

  while (isErrorRecord(current) && !visited.has(current)) {
    visited.add(current)
    if (typeof current.code === 'string' && current.code.length > 0) {
      const value = current[field]
      return typeof value === 'string' && value.length > 0 ? value : undefined
    }
    current = current.cause
  }

  return undefined
}
