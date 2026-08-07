import { Injectable } from '@nestjs/common'
import {
  embedBatchWithPythonWorker,
  isPythonWorkerConfigured,
} from '@third-code-erp/ai'

export class CortexSemanticIndexWorkerError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'CortexSemanticIndexWorkerError'
  }
}

@Injectable()
export class CortexSemanticIndexWorkerClient {
  async embed(texts: string[]): Promise<number[][]> {
    if (!isPythonWorkerConfigured()) {
      throw new CortexSemanticIndexWorkerError('python_worker_unavailable')
    }

    let vectors: number[][]
    try {
      vectors = await embedBatchWithPythonWorker(texts)
    } catch {
      throw new CortexSemanticIndexWorkerError('provider_outcome_unknown')
    }

    if (
      vectors.length !== texts.length ||
      vectors.some(
        (vector) =>
          vector.length !== 1_536 ||
          vector.some((value) => !Number.isFinite(value))
      )
    ) {
      throw new CortexSemanticIndexWorkerError('invalid_embedding_response')
    }
    return vectors
  }
}
