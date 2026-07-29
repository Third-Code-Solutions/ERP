import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createFunction: vi.fn(
    (config: unknown, handler: unknown) => ({ config, handler })
  ),
  createRfqFromBomRecord: vi.fn(),
  notifyRfqCreated: vi.fn(),
}))

vi.mock('./inngest', () => ({
  inngest: {
    createFunction: mocks.createFunction,
  },
}))

vi.mock('@/lib/procurement/rfq-service', () => ({
  createRfqFromBomRecord: mocks.createRfqFromBomRecord,
  notifyRfqCreated: mocks.notifyRfqCreated,
}))

import {
  handleBomApprovedForRfq,
  onBomInternalApproved,
} from './inngest-rfq'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const BOM_ID = '33333333-3333-4333-8333-333333333333'
const PROJECT_ID = '44444444-4444-4444-8444-444444444444'
const RFQ_ID = '55555555-5555-4555-8555-555555555555'

function stepRunner() {
  const run = vi.fn(
    async (_name: string, operation: () => Promise<unknown>) =>
      operation()
  )
  return {
    value: {
      run: run as unknown as <T>(
        name: string,
        operation: () => Promise<T>
      ) => Promise<T>,
    },
    run,
  }
}

describe('BOM-approved RFQ queue handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRfqFromBomRecord.mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 2,
      created: true,
    })
    mocks.notifyRfqCreated.mockResolvedValue(undefined)
  })

  it('registers both current and historical event names', () => {
    const definition = onBomInternalApproved as unknown as {
      config: {
        triggers: { event: string }[]
      }
    }
    expect(definition.config.triggers).toEqual([
      { event: 'bom/approved' },
      { event: 'bom/internal_approved' },
    ])
  })

  it('propagates the initiating actor and separates commit from notification', async () => {
    const step = stepRunner()

    await expect(
      handleBomApprovedForRfq({
        event: {
          name: 'bom/approved',
          data: {
            bomId: BOM_ID,
            tenantId: TENANT_ID,
            actorId: ACTOR_ID,
          },
        },
        step: step.value,
      })
    ).resolves.toEqual({
      created: true,
      rfqId: RFQ_ID,
      bomId: BOM_ID,
      tenantId: TENANT_ID,
    })

    expect(step.run.mock.calls.map(([name]) => name)).toEqual([
      'create-rfq',
      'notify-procurement',
    ])
    expect(mocks.createRfqFromBomRecord).toHaveBeenCalledWith({
      bomId: BOM_ID,
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      source: 'bom_approved_event',
    })
    expect(mocks.notifyRfqCreated).toHaveBeenCalledOnce()
  })

  it('uses a nullable actor for a historical system event', async () => {
    const step = stepRunner()

    await handleBomApprovedForRfq({
      event: {
        name: 'bom/internal_approved',
        data: {
          bomId: BOM_ID,
          tenantId: TENANT_ID,
        },
      },
      step: step.value,
    })

    expect(mocks.createRfqFromBomRecord).toHaveBeenCalledWith({
      bomId: BOM_ID,
      tenantId: TENANT_ID,
      actorId: null,
      source: 'bom_internal_approved_event',
    })
  })

  it('does not notify again when a retry finds the existing RFQ', async () => {
    const step = stepRunner()
    mocks.createRfqFromBomRecord.mockResolvedValue({
      rfqId: RFQ_ID,
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      lineCount: 2,
      created: false,
    })

    await expect(
      handleBomApprovedForRfq({
        event: {
          name: 'bom/approved',
          data: {
            bomId: BOM_ID,
            tenantId: TENANT_ID,
            actorId: ACTOR_ID,
          },
        },
        step: step.value,
      })
    ).resolves.toMatchObject({ created: false, rfqId: RFQ_ID })

    expect(step.run.mock.calls.map(([name]) => name)).toEqual([
      'create-rfq',
    ])
    expect(mocks.notifyRfqCreated).not.toHaveBeenCalled()
  })

  it('rejects invalid event identity before any queue step', async () => {
    const step = stepRunner()

    await expect(
      handleBomApprovedForRfq({
        event: {
          name: 'bom/approved',
          data: {
            bomId: 'not-a-uuid',
            tenantId: TENANT_ID,
          },
        },
        step: step.value,
      })
    ).resolves.toEqual({
      skipped: true,
      reason: 'bomId, tenantId, or actorId invalid',
    })

    expect(step.run).not.toHaveBeenCalled()
    expect(mocks.createRfqFromBomRecord).not.toHaveBeenCalled()
  })
})
