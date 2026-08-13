import { randomUUID } from 'node:crypto'
import {
  Injectable,
  Logger,
  type NestMiddleware,
} from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import type { AuthenticatedRequest } from '../auth/current-principal.decorator'

export const REQUEST_ID_HEADER = 'x-request-id'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const COMMAND_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT'])

type CommandOutcome = 'aborted' | 'failed' | 'rejected' | 'succeeded'

interface CorrelatedRequest extends AuthenticatedRequest {
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
          trace_id: requestId,
          requestId,
          action: this.operation(request),
          operation: this.operation(request),
          tenant_id: (request as CorrelatedRequest).principal?.tenantId ?? null,
          actor_id: (request as CorrelatedRequest).principal?.userId ?? null,
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
      routePath.endsWith('/v1/process/steps')
    ) {
      return 'process.step.create'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/process/tasks')
    ) {
      return 'process.task.create'
    }
    if (
      request.method === 'PATCH' &&
      routePath.endsWith('/v1/process/tasks/:taskId/assignment')
    ) {
      return 'process.task.assign'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/process/tasks/:taskId/clock')
    ) {
      return 'process.sla.start'
    }
    if (
      request.method === 'PATCH' &&
      routePath.endsWith('/v1/process/sla-clocks/:clockId/observe-mode')
    ) {
      return 'process.sla.observe_mode'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/process/sla-clocks/:clockId/evaluate')
    ) {
      return 'process.sla.evaluate'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/process/approval-rules')
    ) {
      return 'process.approval_rule.create'
    }
    if (
      request.method === 'POST' &&
      routePath.endsWith('/v1/process/approvals')
    ) {
      return 'process.approval.create'
    }
    if (
      request.method === 'PATCH' &&
      routePath.endsWith('/v1/process/approvals/:approvalId/decision')
    ) {
      return 'process.approval.decide'
    }
    return 'unknown.command'
  }

  private outcome(statusCode: number): CommandOutcome {
    if (statusCode >= 500) return 'failed'
    if (statusCode >= 400) return 'rejected'
    return 'succeeded'
  }
}
