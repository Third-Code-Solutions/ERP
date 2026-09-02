import { describe, expect, it, vi } from 'vitest'

import {
  createStageTransitionSubmitter,
  getStageTransitionReasonKind,
  runStageTransitionAction,
} from './stage-transition-action'

describe('runStageTransitionAction', () => {
  it('turns a rejected action into visible failure state without success work', async () => {
    const onStart = vi.fn()
    const onError = vi.fn()
    const onSuccess = vi.fn()

    await expect(
      runStageTransitionAction(
        () => Promise.reject(new Error('provider detail')),
        { onStart, onError, onSuccess }
      )
    ).resolves.toBeUndefined()

    expect(onStart).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(
      'Opportunity stage transition could not be completed. Please try again.'
    )
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows a returned action error without running success work', async () => {
    const onStart = vi.fn()
    const onError = vi.fn()
    const onSuccess = vi.fn()

    await runStageTransitionAction(
      () => Promise.resolve({ error: 'KYC approval is required.' }),
      { onStart, onError, onSuccess }
    )

    expect(onStart).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith('KYC approval is required.')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('clears prior failure state on retry and runs success work only after success', async () => {
    let visibleError: string | null = 'Previous failure'
    let refreshCount = 0
    const callbacks = {
      onStart: () => {
        visibleError = null
      },
      onError: (message: string) => {
        visibleError = message
      },
      onSuccess: () => {
        refreshCount += 1
      },
    }

    await runStageTransitionAction(
      () => Promise.resolve({ error: 'Atomic transition failed.' }),
      callbacks
    )
    expect(visibleError).toBe('Atomic transition failed.')
    expect(refreshCount).toBe(0)

    await runStageTransitionAction(() => Promise.resolve({}), callbacks)
    expect(visibleError).toBeNull()
    expect(refreshCount).toBe(1)
  })
})

describe('createStageTransitionSubmitter', () => {
  const callbacks = () => ({
    onStart: vi.fn(),
    onError: vi.fn(),
    onSuccess: vi.fn(),
  })

  it('does not call the action for a blank required reason', async () => {
    const execute = vi.fn(() => Promise.resolve({}))
    const handlers = callbacks()

    await expect(
      createStageTransitionSubmitter().submit(
        { execute, reason: '   ', reasonRequired: true },
        handlers
      )
    ).resolves.toBe(false)

    expect(execute).not.toHaveBeenCalled()
    expect(handlers.onStart).not.toHaveBeenCalled()
    expect(handlers.onError).not.toHaveBeenCalled()
    expect(handlers.onSuccess).not.toHaveBeenCalled()
  })

  it('trims a required reason and forwards it exactly once', async () => {
    const execute = vi.fn(() => Promise.resolve({}))
    const handlers = callbacks()

    await expect(
      createStageTransitionSubmitter().submit(
        {
          execute,
          reason: '  Client selected another contractor.  ',
          reasonRequired: true,
        },
        handlers
      )
    ).resolves.toBe(true)

    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith('Client selected another contractor.')
    expect(handlers.onSuccess).toHaveBeenCalledOnce()
  })

  it('does not call the action beyond the Core reason boundary', async () => {
    const execute = vi.fn(() => Promise.resolve({}))

    await expect(
      createStageTransitionSubmitter().submit(
        { execute, reason: 'x'.repeat(1001), reasonRequired: true },
        callbacks()
      )
    ).resolves.toBe(false)

    expect(execute).not.toHaveBeenCalled()
  })

  it('prevents a duplicate request while the first request is pending', async () => {
    let resolveFirst: ((result: {}) => void) | undefined
    const firstResult = new Promise<{}>((resolve) => {
      resolveFirst = resolve
    })
    const execute = vi.fn(() => firstResult)
    const handlers = callbacks()
    const submitter = createStageTransitionSubmitter()

    const firstSubmission = submitter.submit({ execute }, handlers)
    await expect(submitter.submit({ execute }, handlers)).resolves.toBe(false)

    expect(execute).toHaveBeenCalledOnce()
    resolveFirst?.({})
    await expect(firstSubmission).resolves.toBe(true)
    expect(handlers.onSuccess).toHaveBeenCalledOnce()
  })
})

describe('getStageTransitionReasonKind', () => {
  it('requires Lost-specific reasons for current and legacy Lost stages', () => {
    expect(getStageTransitionReasonKind('contract', 'lost')).toBe('lost')
    expect(getStageTransitionReasonKind('contract', 'closed_lost')).toBe('lost')
  })

  it('keeps actual backward moves on the regression-specific path', () => {
    expect(getStageTransitionReasonKind('bom_submission', 'design')).toBe(
      'regression'
    )
    expect(getStageTransitionReasonKind('design', 'bom_submission')).toBeNull()
  })
})
