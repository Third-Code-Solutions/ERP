import { describe, expect, it, vi } from 'vitest'

import { routeStageAdvanceDestination } from './stage-advance-button'
import { createStageTransitionSubmitter } from './stage-transition-action'

function createHandlers() {
  return {
    advance: vi.fn(),
    openLostReason: vi.fn(),
    openRegressionReason: vi.fn(),
  }
}

describe('routeStageAdvanceDestination', () => {
  it.each(['negotiation', 'resubmission'] as const)(
    'opens a regression reason before %s can submit BOM Submission',
    (currentStage) => {
      const handlers = createHandlers()

      routeStageAdvanceDestination(
        currentStage,
        'bom_submission',
        handlers
      )

      expect(handlers.openRegressionReason).toHaveBeenCalledOnce()
      expect(handlers.openRegressionReason).toHaveBeenCalledWith(
        'bom_submission'
      )
      expect(handlers.openLostReason).not.toHaveBeenCalled()
      expect(handlers.advance).not.toHaveBeenCalled()
    }
  )

  it('keeps Lost on the Lost-specific reason path', () => {
    const handlers = createHandlers()

    routeStageAdvanceDestination('negotiation', 'lost', handlers)

    expect(handlers.openLostReason).toHaveBeenCalledOnce()
    expect(handlers.openLostReason).toHaveBeenCalledWith('lost')
    expect(handlers.openRegressionReason).not.toHaveBeenCalled()
    expect(handlers.advance).not.toHaveBeenCalled()
  })

  it('submits an ordinary forward destination without a reason dialog', () => {
    const handlers = createHandlers()

    routeStageAdvanceDestination('negotiation', 'contract', handlers)

    expect(handlers.advance).toHaveBeenCalledOnce()
    expect(handlers.advance).toHaveBeenCalledWith('contract')
    expect(handlers.openLostReason).not.toHaveBeenCalled()
    expect(handlers.openRegressionReason).not.toHaveBeenCalled()
  })

  it.each(['   ', 'x'.repeat(1001)])(
    'does not call the regression action for invalid reason %#',
    async (reason) => {
      const execute = vi.fn(() => Promise.resolve({}))
      const submitter = createStageTransitionSubmitter()

      await expect(
        submitter.submit(
          { execute, reason, reasonRequired: true },
          {
            onStart: vi.fn(),
            onError: vi.fn(),
            onSuccess: vi.fn(),
          }
        )
      ).resolves.toBe(false)

      expect(execute).not.toHaveBeenCalled()
    }
  )

  it('submits one trimmed regression reason after the dialog confirms', async () => {
    const execute = vi.fn(() => Promise.resolve({}))
    const submitter = createStageTransitionSubmitter()

    await expect(
      submitter.submit(
        {
          execute,
          reason: '  Client requested a revised BOM.  ',
          reasonRequired: true,
        },
        {
          onStart: vi.fn(),
          onError: vi.fn(),
          onSuccess: vi.fn(),
        }
      )
    ).resolves.toBe(true)

    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith('Client requested a revised BOM.')
  })
})
