import {
  PIPELINE_STAGES,
  STAGE_LEGACY_MAP,
  type OpportunityStage,
  type PipelineStage,
} from '@third-code-erp/shared-types'

interface StageTransitionResult {
  error?: string
}

interface StageTransitionCallbacks {
  onStart: () => void
  onError: (message: string) => void
  onSuccess: () => void
}

interface StageTransitionSubmission {
  execute: (reason?: string) => Promise<StageTransitionResult>
  reason?: string
  reasonRequired?: boolean
}

interface StageTransitionSubmitter {
  submit: (
    submission: StageTransitionSubmission,
    callbacks: StageTransitionCallbacks
  ) => Promise<boolean>
}

export const STAGE_REASON_MAX_LENGTH = 1000
export type StageTransitionReasonKind = 'lost' | 'regression'

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

export function createStageTransitionSubmitter(): StageTransitionSubmitter {
  let isPending = false

  return {
    async submit(submission, callbacks) {
      if (isPending) return false

      const normalizedReason = submission.reason?.trim()
      if (
        (submission.reasonRequired && !normalizedReason) ||
        (normalizedReason?.length ?? 0) > STAGE_REASON_MAX_LENGTH
      ) {
        return false
      }

      isPending = true
      try {
        await runStageTransitionAction(
          () => submission.execute(normalizedReason || undefined),
          callbacks
        )
      } finally {
        isPending = false
      }
      return true
    },
  }
}

export function getStageTransitionReasonKind(
  fromStage: PipelineStage,
  toStage: OpportunityStage
): StageTransitionReasonKind | null {
  if (toStage === 'lost' || toStage === 'closed_lost') return 'lost'

  const canonicalToStage =
    STAGE_LEGACY_MAP[toStage] ??
    (PIPELINE_STAGES.includes(toStage as PipelineStage)
      ? (toStage as PipelineStage)
      : null)
  if (!canonicalToStage) return null

  return PIPELINE_STAGES.indexOf(canonicalToStage) <
    PIPELINE_STAGES.indexOf(fromStage)
    ? 'regression'
    : null
}
