import React, { type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  completeRfq: vi.fn(),
  cancelRfq: vi.fn(),
  refresh: vi.fn(),
  setters: [] as ReturnType<typeof vi.fn>[],
  pending: [] as Promise<unknown>[],
  hooksStubbed: false,
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/app/(dashboard)/procurement/rfqs/actions', () => ({
  completeRfq: mocks.completeRfq,
  cancelRfq: mocks.cancelRfq,
}))
// Server-side rendering cannot click, so the handler tests call the component
// as a function with stubbed hooks and invoke the button handlers directly.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (<T,>(initial: T) => {
      if (!mocks.hooksStubbed) return actual.useState(initial)
      const setter = vi.fn()
      mocks.setters.push(setter)
      return [initial, setter]
    }) as typeof actual.useState,
    useTransition: (() => {
      if (!mocks.hooksStubbed) return actual.useTransition()
      return [false, (callback: () => Promise<void>) => { mocks.pending.push(callback()) }]
    }) as typeof actual.useTransition,
  }
})

import { RfqTerminalActions } from './rfq-terminal-actions'

const RFQ_ID = '55555555-5555-4555-8555-555555555555'

function findButton(node: ReactNode, text: string): ReactElement<{ onClick: () => void }> {
  const queue: ReactNode[] = [node]
  while (queue.length > 0) {
    const current = queue.shift()
    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }
    if (!React.isValidElement(current)) continue
    const element = current as ReactElement<{ children?: ReactNode; onClick?: () => void }>
    if (element.type === 'button' && String(element.props.children).includes(text)) {
      return element as ReactElement<{ onClick: () => void }>
    }
    queue.push(element.props.children)
  }
  throw new Error(`No button "${text}"`)
}

/** Renders with stubbed hooks; setters[1] is the error setter (state order: reason, error). */
function renderHandlers(canComplete = true) {
  mocks.hooksStubbed = true
  try {
    return RfqTerminalActions({ rfqId: RFQ_ID, canComplete })
  } finally {
    mocks.hooksStubbed = false
  }
}

describe('RfqTerminalActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setters.length = 0
    mocks.pending.length = 0
  })

  it('renders complete disabled until every line is covered, and the cancel controls', () => {
    const html = renderToStaticMarkup(<RfqTerminalActions rfqId={RFQ_ID} canComplete={false} />)

    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Complete RFQ<\/button>/)
    expect(html).toContain('aria-label="Cancellation reason"')
    expect(html).toContain('Cancel RFQ')
    expect(html).not.toContain('role="alert"')
  })

  it('shows why completing was refused instead of dropping it', async () => {
    mocks.completeRfq.mockResolvedValue({ error: 'Every line needs at least one quote.' })
    const tree = renderHandlers()

    findButton(tree, 'Complete RFQ').props.onClick()
    await Promise.all(mocks.pending)

    expect(mocks.completeRfq).toHaveBeenCalledWith(RFQ_ID)
    expect(mocks.setters[1]).toHaveBeenLastCalledWith('Every line needs at least one quote.')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('refreshes the page once completing succeeds', async () => {
    mocks.completeRfq.mockResolvedValue({})
    const tree = renderHandlers()

    findButton(tree, 'Complete RFQ').props.onClick()
    await Promise.all(mocks.pending)

    expect(mocks.setters[1]).toHaveBeenCalledWith(null)
    expect(mocks.setters[1]).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('asks for a reason before cancelling', () => {
    const tree = renderHandlers()

    findButton(tree, 'Cancel RFQ').props.onClick()

    expect(mocks.setters[1]).toHaveBeenCalledWith('Enter a cancellation reason.')
    expect(mocks.cancelRfq).not.toHaveBeenCalled()
  })
})
