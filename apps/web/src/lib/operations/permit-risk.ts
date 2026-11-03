/** Permit statuses where the authority is done; no return date is pending. */
export const CLOSED_PERMIT_STATUSES = ['approved', 'rejected', 'released', 'refunded', 'cancelled'] as const

export function isClosedPermitStatus(status: string): boolean {
  return (CLOSED_PERMIT_STATUSES as readonly string[]).includes(status)
}

/**
 * Whole days past the expected return date. Null when the permit is closed
 * (nothing is late any more) or when no return date is forecast.
 */
export function permitDaysOverdue(
  status: string,
  expectedReturn: Date | string | null,
  now: number = Date.now(),
): number | null {
  if (isClosedPermitStatus(status) || !expectedReturn) return null
  return Math.max(0, Math.ceil((now - new Date(expectedReturn).getTime()) / 86_400_000))
}
