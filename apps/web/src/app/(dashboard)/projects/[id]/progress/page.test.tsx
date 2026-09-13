import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ profile: vi.fn(), select: vi.fn(), context: vi.fn(), readEnabled: vi.fn(), writeEnabled: vi.fn(), ledger: vi.fn() }))
vi.mock('@third-code-erp/auth', async () => {
  const { roleHasCapability } = await import('@third-code-erp/shared-types/authorization')
  return { requireUserProfile: mocks.profile, can: roleHasCapability }
})
vi.mock('@third-code-erp/database', () => ({ db: { select: mocks.select } }))
vi.mock('./actions', () => ({ loadProgressContext: mocks.context }))
vi.mock('@/lib/erp-core-client', () => ({ getProjectWeeklyProgressThroughCoreApi: mocks.ledger, projectWeeklyProgressReadsUseCoreApi: mocks.readEnabled, projectWeeklyProgressWritesUseCoreApi: mocks.writeEnabled }))
vi.mock('@/components/progress/weekly-update-form', () => ({ WeeklyUpdateForm: () => null }))
vi.mock('@/components/progress/weekly-war-ledger', () => ({ WeeklyWarLedger: () => null }))
vi.mock('@/components/progress/master-schedule-import', () => ({ MasterScheduleImport: () => null }))
vi.mock('@/components/progress/s-curve-chart', () => ({ SCurveChart: () => null }))
vi.mock('@/components/progress/gantt-chart', () => ({ GanttChart: () => null }))
vi.mock('@/components/progress/progress-view-toggle', () => ({ ProgressViewToggle: () => null }))

import Page from './page'
import { WeeklyUpdateForm } from '@/components/progress/weekly-update-form'
import { WeeklyWarLedger } from '@/components/progress/weekly-war-ledger'

const scope = { tenantId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222', projectId: '33333333-3333-4333-8333-333333333333' }
function find(node: React.ReactNode, target: React.ElementType): React.ReactElement<Record<string, unknown>> | undefined {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return undefined
  if (node.type === target) return node
  for (const child of React.Children.toArray(node.props.children)) {
    const result = find(child, target)
    if (result) return result
  }
  return undefined
}
const render = () => Page({ params: Promise.resolve({ id: scope.projectId }), searchParams: Promise.resolve({}) })

describe('weekly command control lifetimes on the progress page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: scope.actorId }, role: 'admin' })
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [{ id: scope.projectId, name: 'Synthetic project', status: 'active' }] }) }) })
    mocks.context.mockResolvedValue({ schedule: null, updates: [] })
    mocks.readEnabled.mockReturnValue(true)
    mocks.writeEnabled.mockReturnValue(true)
    mocks.ledger.mockResolvedValue({ ok: true, data: { projectId: scope.projectId, rows: [], total: 0, page: 1, limit: 12, totalPages: 1 } })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('supplies explicit actor/tenant scope and command authority to both controls', async () => {
    const tree = await render()
    expect(find(tree, WeeklyUpdateForm)?.props).toMatchObject({ ...scope, canSubmit: true, coreWritesEnabled: true })
    expect(find(tree, WeeklyWarLedger)?.props).toMatchObject({ ...scope, canLock: true, enabled: true, rows: [] })
  })

  it('keeps the same keyed control instances through permission and read-result loss', async () => {
    const before = await render()
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: scope.actorId }, role: 'viewer' })
    mocks.ledger.mockResolvedValue({ ok: false, error: 'private upstream details' })
    const after = await render()
    const form = find(after, WeeklyUpdateForm)
    const ledger = find(after, WeeklyWarLedger)
    expect(form).toBeDefined()
    expect(ledger).toBeDefined()
    expect(form?.key).toBe(find(before, WeeklyUpdateForm)?.key)
    expect(ledger?.key).toBe(find(before, WeeklyWarLedger)?.key)
    expect(form?.props.canSubmit).toBe(false)
    expect(ledger?.props.canLock).toBe(false)
    expect(ledger?.props.loadError).toEqual(expect.any(String))
    expect(ledger?.props.loadError).not.toContain('private upstream details')
  })

  it('keeps scope identity stable when canaries change but resets it for another actor', async () => {
    const before = await render()
    mocks.readEnabled.mockReturnValue(false)
    mocks.writeEnabled.mockReturnValue(false)
    const disabled = await render()
    expect(find(disabled, WeeklyWarLedger)?.key).toBe(find(before, WeeklyWarLedger)?.key)
    expect(find(disabled, WeeklyWarLedger)?.props.enabled).toBe(false)
    expect(find(disabled, WeeklyUpdateForm)?.props.coreWritesEnabled).toBe(false)
    mocks.profile.mockResolvedValue({ tenantId: scope.tenantId, user: { id: '44444444-4444-4444-8444-444444444444' }, role: 'admin' })
    const changed = await render()
    expect(find(changed, WeeklyUpdateForm)?.key).not.toBe(find(before, WeeklyUpdateForm)?.key)
    expect(find(changed, WeeklyWarLedger)?.key).not.toBe(find(before, WeeklyWarLedger)?.key)
  })
})
