import { cortexAssistantGenerationAcceptedSchema } from '@third-code-erp/shared-types'

type Fetcher = typeof fetch
type Waiter = (milliseconds: number, signal: AbortSignal) => Promise<void>

const DEFAULT_MAX_POLLS = 10

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function retryAfterMs(response: Response, fallback: number): number {
  const seconds = Number(response.headers.get('Retry-After'))
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback
  return Math.max(500, Math.min(5_000, Math.round(seconds * 1_000)))
}

async function cancel(fetcher: Fetcher, location: string): Promise<void> {
  try {
    await fetcher(location, {
      method: 'DELETE',
      keepalive: true,
      signal: AbortSignal.timeout(3_000),
    })
  } catch {
    // The durable job remains bounded by its Core lease/recovery policy.
  }
}

export async function resolveCortexChatResponse(
  initialResponse: Response,
  options: {
    signal: AbortSignal
    fetcher?: Fetcher
    waiter?: Waiter
    maxPolls?: number
  }
): Promise<Response> {
  if (initialResponse.status !== 202) return initialResponse

  const accepted = cortexAssistantGenerationAcceptedSchema.safeParse(
    await initialResponse.json().catch(() => null)
  )
  if (!accepted.success) {
    throw new Error('Cortex returned an invalid generation handoff.')
  }
  const location = initialResponse.headers.get('Location')
  const expectedLocation = `/api/cortex/chat/jobs/${accepted.data.jobId}`
  if (location !== expectedLocation) {
    throw new Error('Cortex returned an invalid generation location.')
  }

  const fetcher = options.fetcher ?? fetch
  const waiter = options.waiter ?? wait
  const maxPolls = Math.max(
    1,
    Math.min(DEFAULT_MAX_POLLS, options.maxPolls ?? DEFAULT_MAX_POLLS)
  )
  let delay = accepted.data.retryAfterMs
  try {
    for (let poll = 0; poll < maxPolls; poll += 1) {
      await waiter(delay, options.signal)
      const response = await fetcher(location, {
        cache: 'no-store',
        signal: options.signal,
      })
      if (response.status !== 202) return response
      delay = retryAfterMs(response, delay)
    }
  } catch (error) {
    await cancel(fetcher, location)
    throw error
  }

  await cancel(fetcher, location)
  throw new Error('Cortex response generation timed out. Try again.')
}
