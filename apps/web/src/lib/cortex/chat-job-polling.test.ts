import { describe, expect, it, vi } from 'vitest'
import {
  createCortexJobCanceller,
  resolveCortexChatResponse,
} from './chat-job-polling'

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222'
const LOCATION = `/api/cortex/chat/jobs/${JOB_ID}`

function accepted(location = LOCATION) {
  return Response.json(
    {
      status: 'accepted',
      jobId: JOB_ID,
      conversationId: CONVERSATION_ID,
      retryAfterMs: 1_000,
    },
    { status: 202, headers: { Location: location, 'Retry-After': '1' } }
  )
}

const immediateWait = vi.fn().mockResolvedValue(undefined)

describe('Cortex browser job polling', () => {
  it('leaves legacy final responses untouched', async () => {
    const response = new Response('Legacy answer')
    await expect(
      resolveCortexChatResponse(response, {
        signal: new AbortController().signal,
      })
    ).resolves.toBe(response)
  })

  it('polls the exact same-origin job path until one final response', async () => {
    const final = new Response('Worker answer')
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { job: { status: 'processing' }, result: null },
          { status: 202, headers: { 'Retry-After': '1' } }
        )
      )
      .mockResolvedValueOnce(final)
    await expect(
      resolveCortexChatResponse(accepted(), {
        signal: new AbortController().signal,
        fetcher,
        waiter: immediateWait,
      })
    ).resolves.toBe(final)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledWith(
      LOCATION,
      expect.objectContaining({ cache: 'no-store' })
    )
  })

  it('rejects a substituted poll location before any fetch', async () => {
    const fetcher = vi.fn()
    await expect(
      resolveCortexChatResponse(accepted('https://attacker.test/jobs/1'), {
        signal: new AbortController().signal,
        fetcher,
      })
    ).rejects.toThrow('invalid generation location')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('caps polling and requests best-effort cancellation', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(
        { job: { status: 'processing' }, result: null },
        { status: 202, headers: { 'Retry-After': '1' } }
      )
    )
    await expect(
      resolveCortexChatResponse(accepted(), {
        signal: new AbortController().signal,
        fetcher,
        waiter: immediateWait,
        maxPolls: 2,
      })
    ).rejects.toThrow('timed out')
    expect(fetcher).toHaveBeenLastCalledWith(
      LOCATION,
      expect.objectContaining({ method: 'DELETE', keepalive: true })
    )
  })

  it('requests best-effort cancellation when the caller aborts', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const canceller = createCortexJobCanceller(fetcher)
    const controller = new AbortController()
    controller.abort()
    await expect(
      resolveCortexChatResponse(accepted(), {
        signal: controller.signal,
        fetcher,
        canceller,
        onAccepted: (location) => {
          void canceller(location)
        },
        waiter: vi
          .fn()
          .mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).toHaveBeenCalledWith(
      LOCATION,
      expect.objectContaining({ method: 'DELETE', keepalive: true })
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
