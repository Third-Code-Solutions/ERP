import 'reflect-metadata'

import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { TodayController } from './today.controller'

const PRINCIPAL: ErpPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  role: 'admin',
  email: 'admin@example.test',
}

describe('TodayController', () => {
  it('forwards only the normalized query and authenticated principal', async () => {
    const read = vi.fn().mockResolvedValue({
      summary: { dueToday: 0, overdue: 0, upcoming: 0 },
      tasks: [],
      projects: [],
    })
    const controller = new TodayController({ read } as never)

    await expect(
      controller.read({ includeProjects: true }, PRINCIPAL)
    ).resolves.toEqual({
      summary: { dueToday: 0, overdue: 0, upcoming: 0 },
      tasks: [],
      projects: [],
    })
    expect(read).toHaveBeenCalledWith({ includeProjects: true }, PRINCIPAL)
  })
})
