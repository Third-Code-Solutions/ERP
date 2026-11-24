/** What the RFQ complete and cancel controls show after a command. */

export const RFQ_COMMAND_FAILED_ERROR =
  'The request could not be sent. Check your connection and try again.'
export const CANCEL_REASON_MAX_LENGTH = 1000
export const CANCEL_REASON_REQUIRED_ERROR = 'Cancellation reason is required'
export const CANCEL_REASON_TOO_LONG_ERROR = `Cancellation reason must be ${CANCEL_REASON_MAX_LENGTH} characters or fewer`

/** The server's cancel rule, so the form refuses with the same message before sending. */
export function cancelReasonError(reason: string): string | null {
  const text = reason.trim()
  if (!text) return CANCEL_REASON_REQUIRED_ERROR
  if (text.length > CANCEL_REASON_MAX_LENGTH) return CANCEL_REASON_TOO_LONG_ERROR
  return null
}

/**
 * Runs a complete or cancel action. A refusal becomes its message, a call that
 * throws (network failure, server crash) a generic one; null means success.
 */
export async function rfqCommandError(
  command: () => Promise<{ error?: string }>
): Promise<string | null> {
  try {
    return (await command()).error || null
  } catch {
    return RFQ_COMMAND_FAILED_ERROR
  }
}
