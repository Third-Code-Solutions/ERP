import { Injectable } from '@nestjs/common'
import {
  generateGroundedAnswerWithPythonWorker,
  isPythonWorkerConfigured,
  type GroundedAnswerEvidence,
  type GroundedAnswerResult,
} from '@third-code-erp/ai'

export class CortexAssistantGenerationWorkerError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'CortexAssistantGenerationWorkerError'
  }
}

@Injectable()
export class CortexAssistantGenerationWorkerClient {
  async generate(
    question: string,
    evidence: GroundedAnswerEvidence[]
  ): Promise<GroundedAnswerResult> {
    if (!isPythonWorkerConfigured()) {
      throw new CortexAssistantGenerationWorkerError(
        'python_worker_unavailable'
      )
    }
    try {
      return await generateGroundedAnswerWithPythonWorker(question, evidence)
    } catch {
      throw new CortexAssistantGenerationWorkerError(
        'python_worker_request_failed'
      )
    }
  }
}
