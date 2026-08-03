import { randomUUID } from 'node:crypto'
import {
  Injectable,
  Logger,
  type NestMiddleware,
} from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

export const REQUEST_ID_HEADER = 'x-request-id'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COMMAND_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT'])

type CommandOutcome = 'aborted' | 'failed' | 'rejected' | 'succeeded'

interface CorrelatedRequest extends Request {
  requestId: string
}

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  private readonly logger = new Logger(
    RequestObservabilityMiddleware.name
  )

  use(
    request: Request,
    response: Response,
    next: NextFunction
  ): void {
    const requestId = this.requestId(
      request.headers[REQUEST_ID_HEADER]
    )
    ;(request as CorrelatedRequest).requestId = requestId
    response.setHeader(REQUEST_ID_HEADER, requestId)

    if (!COMMAND_METHODS.has(request.method)) {
      next()
      return
    }

    const startedAt = Date.now()
    let recorded = false
    const record = (aborted = false) => {
      if (recorded) return
      recorded = true
      this.logger.log(
        JSON.stringify({
          event: 'erp.command.outcome',
          requestId,
          operation: this.operation(request),
          method: request.method,
          statusCode: aborted ? null : response.statusCode,
          outcome: aborted
            ? 'aborted'
            : this.outcome(response.statusCode),
          durationMs: Date.now() - startedAt,
        })
      )
    }

    response.once('finish', () => record())
    response.once('close', () => {
      if (!response.writableFinished) record(true)
    })
    next()
  }

  private requestId(value: string | string[] | undefined): string {
    return typeof value === 'string' && UUID_PATTERN.test(value)
      ? value
      : randomUUID()
  }

  private operation(request: Request): string {
    const routePath =
      typeof request.route?.path === 'string'
        ? request.route.path
        : ''
    if (
      request.method === 'PATCH' &&
      routePath.endsWith('/v1/projects/:projectId')
    ) {
      return 'project.update'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/documents/:documentId/cad-evidence')
    ) {
      return 'document.cad_evidence_commit'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/documents/:documentId/processing-jobs')
    ) {
      return 'document.processing_enqueue'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/finance/journals/:journalEntryId/post')
    ) {
      return 'finance.journal_post'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/finance/journals/:journalEntryId/reverse')
    ) {
      return 'finance.journal_reverse'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/finance/supplier-bills/:supplierBillId/post')
    ) {
      return 'finance.supplier_bill_post'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/finance/supplier-bills/:supplierBillId/reverse')
    ) {
      return 'finance.supplier_bill_reverse'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith(
        '/v1/procurement/deliveries/:deliveryScheduleId/site-preparation/start'
      )
    ) {
      return 'procurement.delivery_site_preparation_start'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith(
        '/v1/procurement/deliveries/:deliveryScheduleId/site-preparation/complete'
      )
    ) {
      return 'procurement.delivery_site_preparation_complete'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith(
        '/v1/procurement/deliveries/:deliveryScheduleId/inspection/start'
      )
    ) {
      return 'procurement.delivery_inspection_start'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith(
        '/v1/procurement/deliveries/:deliveryScheduleId/inspection/complete'
      )
    ) {
      return 'procurement.delivery_inspection_complete'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith(
        '/v1/procurement/deliveries/:deliveryScheduleId/cancel'
      )
    ) {
      return 'procurement.delivery_cancel'
    }
    return 'unknown.command'
  }

  private outcome(statusCode: number): CommandOutcome {
    if (statusCode >= 500) return 'failed'
    if (statusCode >= 400) return 'rejected'
    return 'succeeded'
  }
}
