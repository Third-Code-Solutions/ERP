interface StageTransitionResult {
  error?: string
}

interface StageTransitionCallbacks {
  onStart: () => void
  onError: (message: string) => void
  onSuccess: () => void
}

const UNEXPECTED_STAGE_TRANSITION_ERROR =
  'Opportunity stage transition could not be completed. Please try again.'

export async function runStageTransitionAction(
  execute: () => Promise<StageTransitionResult>,
  callbacks: StageTransitionCallbacks
): Promise<void> {
  callbacks.onStart()
  let result: StageTransitionResult
  try {
    result = await execute()
  } catch {
    callbacks.onError(UNEXPECTED_STAGE_TRANSITION_ERROR)
    return
  }
  if (result.error) {
    callbacks.onError(result.error)
    return
  }
  callbacks.onSuccess()
}
