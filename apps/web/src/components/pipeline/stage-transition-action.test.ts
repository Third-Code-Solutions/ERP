import { describe, expect, it, vi } from 'vitest'

import { runStageTransitionAction } from './stage-transition-action'

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
