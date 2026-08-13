import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  DATABASE_URL,
  makeSql,
} from '../../../../../../../packages/database/src/__tests__/_db-harness'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  can: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  can: mocks.can,
}))

const runtimeSuite = DATABASE_URL ? describe : describe.skip

runtimeSuite('generic takeoff import API with PostgreSQL', () => {
  let sql: ReturnType<typeof makeSql>
  let tenantId: string
  let userId: string
  let projectId: string
  let bomId: string

  beforeAll(async () => {
    sql = makeSql()
    const suffix = (
      (await sql.unsafe(`select substr(md5(random()::text), 1, 10) as suffix`)) as Array<{ suffix: string }>
    )[0]!.suffix
    tenantId = (
      (await sql.unsafe(
        `insert into tenants(name, slug) values ('Takeoff API ${suffix}', 'takeoff-api-${suffix}') returning id`,
      )) as Array<{ id: string }>
    )[0]!.id
    userId = (
      (await sql.unsafe(
        `insert into users(id, tenant_id, email, full_name, role)
         values (gen_random_uuid(), '${tenantId}', 'takeoff-${suffix}@probe.test', 'Takeoff API', 'commercial') returning id`,
      )) as Array<{ id: string }>
    )[0]!.id
    projectId = (
      (await sql.unsafe(
        `insert into projects(tenant_id, name, client, created_by)
         values ('${tenantId}', 'Takeoff API project', 'Takeoff client', '${userId}') returning id`,
      )) as Array<{ id: string }>
    )[0]!.id
    bomId = (
      (await sql.unsafe(
        `insert into boms(tenant_id, project_id, created_by, label)
         values ('${tenantId}', '${projectId}', '${userId}', 'Takeoff API BOM') returning id`,
      )) as Array<{ id: string }>
    )[0]!.id

    mocks.requireUserProfile.mockResolvedValue({
      user: { id: userId },
      tenantId,
      role: 'commercial',
      email: `takeoff-${suffix}@probe.test`,
      fullName: 'Takeoff API',
    })
    mocks.can.mockReturnValue(true)
  })

  afterAll(async () => {
    // The audit log is append-only and intentionally prevents tenant deletion.
    // This suite is only enabled against the disposable local database lane;
    // that lane recreates the database before the next run.
    await sql?.end({ timeout: 5 })
  })

  it('previews, commits, and re-imports without losing vendor or DUPA state', async () => {
    const { POST } = await import('./route')
    const csv = [
      'Row,Description,Qty,UOM,Division,Location',
      'A-001,Suspended ceiling,12,sqm,Finishes,Level 2',
      'A-002,Unresolved item,1,box,,Level 2',
    ].join('\n')
    const mapping = JSON.stringify({
      sourceRowKey: 'Row',
      description: 'Description',
      quantity: 'Qty',
      unit: 'UOM',
      division: 'Division',
      location: 'Location',
    })

    const makeRequest = (mode: 'preview' | 'commit', csvPayload = csv) => {
      const form = new FormData()
      form.set('file', new File([csvPayload], 'takeoff.csv', { type: 'text/csv' }))
      form.set('bom_id', bomId)
      form.set('source', 'generic')
      form.set('drawing_revision_key', 'drawing-1')
      form.set('mode', mode)
      form.set('mapping', mapping)
      return new NextRequest('http://localhost/api/bom/takeoff-import', { method: 'POST', body: form })
    }

    const preview = await POST(makeRequest('preview'))
    expect(preview.status).toBe(200)
    await expect(preview.json()).resolves.toMatchObject({
      ok: true,
      mode: 'preview',
      rowCount: 2,
      unresolvedCount: 2,
    })

    const firstCommit = await POST(makeRequest('commit'))
    expect(firstCommit.status).toBe(200)
    const firstPayload = await firstCommit.json()
    expect(firstPayload).toMatchObject({ ok: true, mode: 'commit', linesUpserted: 2, unresolvedCount: 2, bomId })

    const line = (
      (await sql.unsafe(
        `select id from bom_line_items where tenant_id = '${tenantId}' and takeoff_import_id = '${firstPayload.importId}' and source_row_key = 'A-001'`,
      )) as Array<{ id: string }>
    )[0]!
    await sql.unsafe(
      `update bom_line_items
       set unit_rate_source = 'dupa', unit_cost_cents = 777, line_total_cents = 777,
           notes = '[VENDOR:11111111-1111-1111-1111-111111111111:Vendor One]'
       where id = '${line.id}'`,
    )

    const changedCsv = [
      'Row,Description,Qty,UOM,Division,Location',
      'A-001,Changed ceiling,18,sqm,Finishes,Level 2',
      'A-002,Unresolved item,1,box,,Level 2',
    ].join('\n')
    const secondCommit = await POST(makeRequest('commit', changedCsv))
    expect(secondCommit.status).toBe(200)
    const secondPayload = await secondCommit.json()
    expect(secondPayload).toMatchObject({
      ok: true,
      linesUpserted: 2,
      unresolvedCount: 2,
    })
    expect(secondPayload.importId).toBe(firstPayload.importId)

    const persisted = (
      (await sql.unsafe(
        `select description, quantity, unit_cost_cents, line_total_cents, notes
         from bom_line_items where id = '${line.id}'`,
      )) as Array<Record<string, unknown>>
    )[0]!
    const count = (
      (await sql.unsafe(
        `select count(*)::int as count from bom_line_items
         where tenant_id = '${tenantId}' and takeoff_import_id = '${firstPayload.importId}'`,
      )) as Array<{ count: number }>
    )[0]!.count

    expect(count).toBe(2)
    expect(persisted.description).toBe('Suspended ceiling')
    expect(Number(persisted.quantity)).toBe(12)
    expect(Number(persisted.unit_cost_cents)).toBe(777)
    expect(Number(persisted.line_total_cents)).toBe(777)
    expect(persisted.notes).toContain('VENDOR:11111111-1111-1111-1111-111111111111')
  })
})
