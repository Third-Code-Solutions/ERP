import { EventEmitter } from 'node:events'
import { Logger } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  REQUEST_ID_HEADER,
  RequestObservabilityMiddleware,
} from './request-observability.middleware'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-2333-8333-333333333333'

class ResponseHarness extends EventEmitter {
  statusCode = 200
  readonly setHeader = vi.fn()
}

function requestHarness(
  overrides: Partial<Request> = {}
): Request {
  return {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer never-log-this-token',
      [REQUEST_ID_HEADER]: REQUEST_ID,
    },
    body: {
      notes: 'never-log-this-command-payload',
    },
    originalUrl: `/v1/projects/${PROJECT_ID}?secret=never-log-this-query`,
    route: {
      path: '/v1/projects/:projectId',
    },
    ...overrides,
  } as unknown as Request
}

describe('RequestObservabilityMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits one sanitized structured Project command outcome', () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined)
    const response = new ResponseHarness()
    const next = vi.fn()
    const middleware = new RequestObservabilityMiddleware()

    middleware.use(
      requestHarness(),
      response as unknown as Response,
      next as NextFunction
    )
    response.emit('finish')

    expect(next).toHaveBeenCalledOnce()
    expect(response.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      REQUEST_ID
    )
    expect(log).toHaveBeenCalledOnce()

    const serialized = String(log.mock.calls[0]?.[0])
    expect(JSON.parse(serialized)).toMatchObject({
      event: 'erp.command.outcome',
      requestId: REQUEST_ID,
      operation: 'project.update',
      method: 'PATCH',
      statusCode: 200,
      outcome: 'succeeded',
    })
    expect(serialized).not.toContain('never-log-this-token')
    expect(serialized).not.toContain(
      'never-log-this-command-payload'
    )
    expect(serialized).not.toContain('never-log-this-query')
    expect(serialized).not.toContain(PROJECT_ID)
  })

  it('replaces an unsafe correlation value and classifies rejection', () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined)
    const response = new ResponseHarness()
    response.statusCode = 403
    const middleware = new RequestObservabilityMiddleware()

    middleware.use(
      requestHarness({
        headers: {
          [REQUEST_ID_HEADER]: 'unsafe\r\nforged-log-line',
        },
      }),
      response as unknown as Response,
      vi.fn() as NextFunction
    )
    response.emit('finish')

    const responseRequestId = response.setHeader.mock.calls[0]?.[1]
    expect(responseRequestId).toEqual(expect.any(String))
    expect(responseRequestId).not.toBe('unsafe\r\nforged-log-line')
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      requestId: responseRequestId,
      statusCode: 403,
      outcome: 'rejected',
    })
  })

  it('correlates reads without emitting a command outcome', () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined)
    const response = new ResponseHarness()
    const middleware = new RequestObservabilityMiddleware()

    middleware.use(
      requestHarness({ method: 'GET' }),
      response as unknown as Response,
      vi.fn() as NextFunction
    )
    response.emit('finish')

    expect(response.setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      REQUEST_ID
    )
    expect(log).not.toHaveBeenCalled()
  })
})
