import 'reflect-metadata'

import { BadRequestException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { SiteDiaryController } from './site-diary.controller'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const principal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'pm' as const,
  email: 'pm@example.test',
}

describe('SiteDiaryController', () => {
  it('normalizes and forwards strict list filters', async () => {
    const diary = { list: vi.fn().mockResolvedValue({ rows: [] }) }
    const controller = new SiteDiaryController(diary as never)
    await controller.list(PROJECT_ID, { status: 'draft', fromDate: '2026-09-01', page: '2', limit: '10' }, principal)
    expect(diary.list).toHaveBeenCalledWith(
      PROJECT_ID,
      { status: 'draft', fromDate: '2026-09-01', page: 2, limit: 10 },
      principal,
    )
  })

  it('rejects forged fields and route/body project mismatch', () => {
    const diary = { create: vi.fn() }
    const controller = new SiteDiaryController(diary as never)
    expect(() => controller.create(PROJECT_ID, {
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      manpowerCount: 1,
      workCompleted: 'x',
      weather: '',
      constraints: '',
      safetyNotes: '',
      tenantId: 'injected',
    }, principal)).toThrow(BadRequestException)
    expect(() => controller.create(PROJECT_ID, {
      projectId: '66666666-6666-4666-8666-666666666666',
      clientRequestId: REQUEST_ID,
      diaryDate: '2026-09-10',
      manpowerCount: 1,
      workCompleted: 'x',
      weather: '',
      constraints: '',
      safetyNotes: '',
    }, principal)).toThrow(BadRequestException)
    expect(diary.create).not.toHaveBeenCalled()
  })

  it('uses explicit update and submit commands', async () => {
    const diary = {
      update: vi.fn().mockResolvedValue({ changed: true }),
      submit: vi.fn().mockResolvedValue({ changed: true }),
    }
    const controller = new SiteDiaryController(diary as never)
    await controller.update(PROJECT_ID, ENTRY_ID, {
      expectedVersion: 1,
      weather: 'Sunny',
      manpowerCount: 10,
      workCompleted: 'Completed work',
      constraints: '',
      safetyNotes: '',
    }, principal)
    await controller.submit(PROJECT_ID, ENTRY_ID, { expectedVersion: 2 }, principal)
    expect(diary.update).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, expect.objectContaining({ expectedVersion: 1 }), principal)
    expect(diary.submit).toHaveBeenCalledWith(PROJECT_ID, ENTRY_ID, { expectedVersion: 2 }, principal)
  })
})
