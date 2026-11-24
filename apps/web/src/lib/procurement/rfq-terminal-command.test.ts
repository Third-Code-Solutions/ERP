import { describe, expect, it } from 'vitest'
import {
  CANCEL_REASON_MAX_LENGTH,
  CANCEL_REASON_REQUIRED_ERROR,
  CANCEL_REASON_TOO_LONG_ERROR,
  RFQ_COMMAND_FAILED_ERROR,
  cancelReasonError,
  rfqCommandError,
} from './rfq-terminal-command'

describe('rfqCommandError', () => {
  it('returns the refusal so it is shown instead of dropped', async () => {
    expect(await rfqCommandError(async () => ({ error: 'Every line needs at least one quote.' }))).toBe(
      'Every line needs at least one quote.'
    )
  })

  it('returns null when the action succeeds', async () => {
    expect(await rfqCommandError(async () => ({}))).toBeNull()
  })

  it('turns a thrown call into a generic message without its cause', async () => {
    const message = await rfqCommandError(async () => {
      throw new Error('fetch failed: ECONNRESET 10.0.0.1')
    })

    expect(message).toBe(RFQ_COMMAND_FAILED_ERROR)
    expect(message).not.toContain('ECONNRESET')
  })
})

describe('cancelReasonError', () => {
  it.each(['', '   ', '\n\t'])('requires a reason (%j)', (reason) => {
    expect(cancelReasonError(reason)).toBe(CANCEL_REASON_REQUIRED_ERROR)
  })

  it('accepts a trimmed reason up to the server limit and refuses a longer one', () => {
    expect(cancelReasonError(`  ${'x'.repeat(CANCEL_REASON_MAX_LENGTH)}  `)).toBeNull()
    expect(cancelReasonError('x'.repeat(CANCEL_REASON_MAX_LENGTH + 1))).toBe(CANCEL_REASON_TOO_LONG_ERROR)
  })
})
