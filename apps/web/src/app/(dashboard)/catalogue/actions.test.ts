import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireUserProfile: vi.fn(),
  db: { transaction: vi.fn() },
  stampActor: vi.fn(),
  writeAudit: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@third-code-erp/auth', () => ({
  requireUserProfile: mocks.requireUserProfile,
  AuthError: class AuthError extends Error {},
}))
vi.mock('@third-code-erp/database', () => ({ db: mocks.db }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/audit', async () => ({
  computeDiff: (
    await vi.importActual<typeof import('@third-code-erp/shared-types')>(
      '@third-code-erp/shared-types',
    )
  ).computeDiff,
  stampActorInTransaction: mocks.stampActor,
  writeAuditLogInTransaction: mocks.writeAudit,
}))

import { manilaToday } from '@/lib/catalogue/rules'
import { editCatalogueItem, recordCataloguePrice } from './actions'

const TENANT = '22222222-2222-4222-8222-222222222222'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const ITEM = '44444444-4444-4444-8444-444444444444'
const PRICE = '55555555-5555-4555-8555-555555555555'
const profile = (role: string) => ({ user: { id: ACTOR }, tenantId: TENANT, role })

interface Call {
  method: string
  args: unknown[]
}

function chain(result: unknown): { builder: unknown; calls: Call[] } {
  const calls: Call[] = []
  const builder: unknown = new Proxy(() => undefined, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: unknown) => unknown) => resolve(result)
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(property), args })
        return builder
      }
    },
  })
  return { builder, calls }
}

function argOf(calls: Call[], method: string): unknown {
  const call = calls.find((entry) => entry.method === method)
  if (!call) throw new Error(`${method} was not called`)
  return call.args[0]
}

const paramsOf = (where: unknown) => new PgDialect().sqlToQuery(where as SQL).params

/** Runs the action's transaction against a fake `tx`. */
function useTransaction({ selected, inserted = [] }: { selected: unknown[]; inserted?: unknown[] }) {
  const select = chain(selected)
  const update = chain(undefined)
  const insert = chain(inserted)
  const tx = {
    select: vi.fn(() => select.builder),
    update: vi.fn(() => update.builder),
    insert: vi.fn(() => insert.builder),
  }
  mocks.db.transaction.mockImplementation((run: (handle: typeof tx) => unknown) => run(tx))
  return { tx, select, update, insert }
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

const EDIT = {
  id: ITEM,
  name: 'Cement 40 kg',
  specification: 'Type 1P',
  unit: 'bag',
  trade: 'concrete',
  is_active: 'on',
}
const BEFORE = {
  name: 'Cement',
  specification: null,
  unit: 'bag',
  trade: 'concrete',
  is_active: true,
}
const PRICE_FORM = {
  item_id: ITEM,
  price_php: '265.005',
  region: '',
  price_basis: 'material_supply;incl_VAT',
  source_name: 'Wilcon Depot',
  source_url: '',
  checked_on: '2026-11-05',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('ERP_CATALOGUE_ENABLED', 'true')
  mocks.requireUserProfile.mockResolvedValue(profile('commercial'))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe.each([
  ['editCatalogueItem', editCatalogueItem, EDIT],
  ['recordCataloguePrice', recordCataloguePrice, PRICE_FORM],
] as const)('%s gate', (_name, action, fields) => {
  it.each(['', 'false', '1'])('is not found while ERP_CATALOGUE_ENABLED=%j', async (value) => {
    vi.stubEnv('ERP_CATALOGUE_ENABLED', value)

    expect(await action(form(fields))).toEqual({ ok: false, status: 404, error: 'Not found' })
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })

  it.each(['estimator', 'procurement', 'viewer', 'finance'])(
    'is forbidden for %s, who lacks catalogue.manage',
    async (role) => {
      mocks.requireUserProfile.mockResolvedValue(profile(role))

      expect(await action(form(fields))).toMatchObject({ ok: false, status: 403 })
      expect(mocks.db.transaction).not.toHaveBeenCalled()
      expect(mocks.writeAudit).not.toHaveBeenCalled()
    },
  )

  it('reads another tenant\'s item as not found and writes nothing', async () => {
    const { tx, select } = useTransaction({ selected: [] })

    expect(await action(form(fields))).toEqual({
      ok: false,
      status: 404,
      error: 'Catalogue item not found',
    })
    expect(paramsOf(argOf(select.calls, 'where'))).toEqual([ITEM, TENANT])
    expect(tx.update).not.toHaveBeenCalled()
    expect(tx.insert).not.toHaveBeenCalled()
    expect(mocks.writeAudit).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('returns a bounded error when the transaction fails', async () => {
    mocks.db.transaction.mockRejectedValue(new Error('connection reset: secret-host:5432'))

    const result = await action(form(fields))

    expect(result).toMatchObject({ ok: false, status: 500 })
    expect(JSON.stringify(result)).not.toContain('secret-host')
  })
})

describe('editCatalogueItem', () => {
  it('updates the item in the caller tenant and audits the before and after values', async () => {
    const { tx, update } = useTransaction({ selected: [BEFORE] })

    const result = await editCatalogueItem(
      form({ ...EDIT, name: '  Cement\t40 kg\u0000 ', specification: ' Type 1P\r\nbagged ' }),
    )

    expect(result).toEqual({ ok: true, data: { id: ITEM } })
    expect(argOf(update.calls, 'set')).toMatchObject({
      name: 'Cement 40 kg',
      specification: 'Type 1P\nbagged',
      unit: 'bag',
      trade: 'concrete',
      is_active: true,
      updated_by: ACTOR,
    })
    expect(paramsOf(argOf(update.calls, 'where'))).toEqual([ITEM, TENANT])
    expect(mocks.stampActor).toHaveBeenCalledWith(tx, ACTOR)
    expect(mocks.writeAudit).toHaveBeenCalledWith(tx, {
      tenantId: TENANT,
      actorId: ACTOR,
      entityType: 'catalogue_item',
      entityId: ITEM,
      action: 'update',
      diff: {
        name: { before: 'Cement', after: 'Cement 40 kg' },
        specification: { before: null, after: 'Type 1P\nbagged' },
      },
    })
    expect(mocks.revalidatePath.mock.calls).toEqual([['/catalogue'], [`/catalogue/${ITEM}`]])
  })

  it('keeps text that merely looks like a formula and can deactivate an item', async () => {
    const { update } = useTransaction({ selected: [BEFORE] })

    await editCatalogueItem(form({ ...EDIT, name: '=Cement', specification: '', is_active: '' }))

    expect(argOf(update.calls, 'set')).toMatchObject({
      name: '=Cement',
      specification: null,
      is_active: false,
    })
  })

  // The form shows the error as it is, so each is a sentence, not a field path.
  it.each([
    [{ id: 'not-a-uuid' }, 'This item could not be identified. Reload the page and try again.'],
    [{ name: ' \t ' }, 'Enter a name.'],
    [{ name: 'x'.repeat(301) }, 'The name must be 300 characters or fewer.'],
    [{ unit: '' }, 'Enter a unit.'],
    [{ unit: 'x'.repeat(21) }, 'The unit must be 20 characters or fewer.'],
    [{ trade: 'carpentry' }, 'Choose a trade from the list.'],
    [{ specification: 'x'.repeat(2_001) }, 'The specification must be 2000 characters or fewer.'],
  ])('rejects %j before opening a transaction', async (override, message) => {
    const result = await editCatalogueItem(form({ ...EDIT, ...override }))

    expect(result).toEqual({ ok: false, status: 400, error: message })
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })
})

describe('recordCataloguePrice', () => {
  it('appends a manual observation from a single price and audits it', async () => {
    const { tx, insert } = useTransaction({ selected: [{ id: ITEM }], inserted: [{ id: PRICE }] })

    const result = await recordCataloguePrice(form(PRICE_FORM))

    const observation = {
      item_id: ITEM,
      region: 'NCR',
      // 265.005 pesos, half-up at the centavo, as low = average = high.
      price_low_centavos: 26_501,
      price_avg_centavos: 26_501,
      price_high_centavos: 26_501,
      price_basis: 'material_supply;incl_VAT',
      source_kind: 'manual',
      source_name: 'Wilcon Depot',
      source_url: null,
      checked_on: '2026-11-05',
    }
    expect(result).toEqual({ ok: true, data: { id: PRICE } })
    expect(argOf(insert.calls, 'values')).toEqual({
      ...observation,
      tenant_id: TENANT,
      created_by: ACTOR,
    })
    expect(tx.update).not.toHaveBeenCalled()
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        tenantId: TENANT,
        actorId: ACTOR,
        entityType: 'catalogue_price',
        entityId: PRICE,
        action: 'create',
      }),
    )
    expect(mocks.writeAudit.mock.calls[0]?.[1].diff).toMatchObject({
      price_avg_centavos: { after: 26_501 },
      source_kind: { after: 'manual' },
    })
    expect(mocks.revalidatePath.mock.calls).toEqual([['/catalogue'], [`/catalogue/${ITEM}`]])
  })

  it('accepts low, average and high, cleans text and stores the parsed URL', async () => {
    const { insert } = useTransaction({ selected: [{ id: ITEM }], inserted: [{ id: PRICE }] })

    await recordCataloguePrice(
      form({
        ...PRICE_FORM,
        price_php: '',
        price_low_php: '₱1,200',
        price_avg_php: '1,250.50',
        price_high_php: '1300',
        region: ' Region\tVII ',
        source_name: ' Citi\u0000 Hardware\r\n',
        source_url: ' HTTPS://Example.com/list ',
        checked_on: manilaToday(),
      }),
    )

    expect(argOf(insert.calls, 'values')).toMatchObject({
      price_low_centavos: 120_000,
      price_avg_centavos: 125_050,
      price_high_centavos: 130_000,
      region: 'Region VII',
      source_name: 'Citi Hardware',
      source_url: 'https://example.com/list',
      checked_on: manilaToday(),
    })
  })

  // The form shows the error as it is, so each is a sentence, not a field path.
  it.each([
    [{ checked_on: '2999-01-01' }, `Checked date 2999-01-01 is after today (${manilaToday()}, Manila).`],
    [{ checked_on: '05/11/2026' }, 'Checked date must be a real date in YYYY-MM-DD form.'],
    [{ price_php: '' }, 'Give a single price, or all of low, average and high.'],
    [{ price_low_php: '200' }, 'Give either a single price or low, average and high, not both.'],
    [{ price_php: 'two hundred' }, '"two hundred" is not a valid peso amount.'],
    [{ price_php: '-5' }, '"-5" is not a valid peso amount.'],
    [
      { price_php: '', price_low_php: '300', price_avg_php: '250', price_high_php: '400' },
      'Low price must not be above the average price.',
    ],
    [
      { price_php: '', price_low_php: '100', price_avg_php: '500', price_high_php: '400' },
      'Average price must not be above the high price.',
    ],
    [{ source_name: '', source_url: '' }, 'Give a source name or a source URL.'],
    [{ source_url: 'javascript:alert(1)' }, 'Source URL must start with http:// or https://.'],
    [
      { source_url: 'https://user:pw@example.com/' },
      'Source URL must not contain a username or password.',
    ],
    [{ source_url: 'https://example.com/a b' }, 'Source URL must not contain whitespace.'],
    [{ item_id: 'CN-0001' }, 'This item could not be identified. Reload the page and try again.'],
    [{ region: 'x'.repeat(41) }, 'The region must be 40 characters or fewer.'],
    [{ price_basis: 'x'.repeat(61) }, 'The price basis must be 60 characters or fewer.'],
    [{ source_name: 'x'.repeat(201) }, 'The source name must be 200 characters or fewer.'],
  ])('rejects %j before opening a transaction', async (override, message) => {
    const result = await recordCataloguePrice(form({ ...PRICE_FORM, ...override }))

    expect(result).toEqual({ ok: false, status: 400, error: message })
    expect(mocks.db.transaction).not.toHaveBeenCalled()
  })
})
