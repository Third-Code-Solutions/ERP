import { createHash } from 'node:crypto'
import type { CortexAssistantGenerationCommitCompletion } from '@third-code-erp/shared-types'

export function cortexAssistantGenerationCompletionHash(input: {
  jobId: string
  requestId: string
  completion: CortexAssistantGenerationCommitCompletion
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        jobId: input.jobId,
        requestId: input.requestId,
        content: input.completion.content,
        citationNodeIds: input.completion.citationNodeIds,
        outcome: input.completion.outcome,
        model: input.completion.model,
        providerAttemptId:
          input.completion.outcome === 'provider_grounded'
            ? input.completion.providerAttemptId
            : null,
      }),
      'utf8'
    )
    .digest('hex')
}
