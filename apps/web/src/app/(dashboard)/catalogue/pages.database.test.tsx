/**
 * The two catalogue pages rendered on the server from real rows: the page
 * components, the real query module and a real database, nothing in between.
 *
 * Local only: CI does not run it, because it needs the abi-ops-local tenant
 * with the research files committed to it, which a fresh CI database does not
 * have (catalogue.database.test.ts, which seeds its own rolled-back tenant,
 * runs in CI instead). Needs DATABASE_URL and skips itself without it. It only
 * reads. Seed the local tenant first:
 *
 *   node scripts/seed-catalogue.mjs --tenant <id of the abi-ops-local tenant>
 *
 * Only what cannot exist in a test is stubbed: the signed-in user and the
 * feature flag.
 */
import { randomUUID } from 'node:crypto'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '@third-code-erp/database'
import { catalogueItems, tenants } from '@third-code-erp/database/schema'
import { formatCents } from '@third-code-erp/shared-types'
import { readResearchFiles } from '@/lib/catalogue/research-files'

const mocks = vi.hoisted(() => ({ profile: vi.fn() }))

vi.mock('@third-code-erp/auth', async (original) => ({
  ...(await original<typeof import('@third-code-erp/auth')>()),
  requireUserProfile: mocks.profile,
}))

import CatalogueItemPage from './[itemId]/page'
import CataloguePage from './page'

const DATABASE_URL = process.env.DATABASE_URL?.trim()
if (DATABASE_URL && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(DATABASE_URL).hostname)) {
  throw new Error('The catalogue database tests only run against a loopback database')
}
const suite = DATABASE_URL ? describe : describe.skip

const SEEDED_TENANT = 'abi-ops-local'
// What Next's notFound() throws.
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404'
const PAGE_SIZE = 50

const rows = readResearchFiles()
const rowOf = (code: string) => {
  const row = rows.find((candidate) => candidate.code === code)
  if (!row) throw new Error(`${code} is not in data/catalogue`)
  return row
}

/** Text as React writes it into HTML. */
const escaped = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')

const amountCells = (centavos: Array<number | null>) =>
  centavos
    .map((value) => `<td class="currency">${value === null ? '—' : formatCents(value)}</td>`)
    .join('')

/** The body rows of the page's table, one string per row. */
const dataRows = (html: string) =>
  (html.split('<tbody>')[1]?.split('</tbody>')[0] ?? '').split('<tr>').slice(1)

let tenantId = ''
const itemIds = new Map<string, string>()

function signIn(role: string, tenant = tenantId) {
  mocks.profile.mockResolvedValue({ user: { id: randomUUID() }, tenantId: tenant, role })
}

async function listPage(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await CataloguePage({ searchParams: Promise.resolve(searchParams) }))
}

async function itemPage(itemId: string) {
  return renderToStaticMarkup(await CatalogueItemPage({ params: Promise.resolve({ itemId }) }))
}

suite('catalogue pages rendered from the seeded database', { timeout: 60_000 }, () => {
  beforeAll(async () => {
    vi.stubGlobal('React', React)
    vi.stubEnv('ERP_CATALOGUE_ENABLED', 'true')

    const [tenant] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, SEEDED_TENANT))
    const [stored] = tenant
      ? await db
          .select({ items: sql<number>`count(*)::int` })
          .from(catalogueItems)
          .where(eq(catalogueItems.tenant_id, tenant.id))
      : []
    if (!tenant || stored?.items !== rows.length) {
      throw new Error(
        `Seed the catalogue first: tenant "${SEEDED_TENANT}" holds ${stored?.items ?? 'no'} of the ${rows.length} items`,
      )
    }
    tenantId = tenant.id

    const wanted = await db
      .select({ id: catalogueItems.id, code: catalogueItems.code })
      .from(catalogueItems)
      .where(
        and(
          eq(catalogueItems.tenant_id, tenantId),
          inArray(catalogueItems.code, ['EL-0048', 'CN-0037']),
        ),
      )
    for (const item of wanted) itemIds.set(item.code, item.id)
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    await db.$client.end({ timeout: 5 })
  })

  describe('the list page', () => {
    beforeAll(() => signIn('estimator'))

    it('shows 50 rows of the whole catalogue with a next link and no previous link', async () => {
      const html = await listPage()
      const pages = Math.ceil(rows.length / PAGE_SIZE)
      const codes = rows.map((row) => row.code).sort()

      expect(pages).toBe(21)
      expect(dataRows(html)).toHaveLength(PAGE_SIZE)
      expect(dataRows(html)[0]).toContain(`<strong>${codes[0]}</strong>`)
      expect(dataRows(html)[49]).toContain(`<strong>${codes[49]}</strong>`)
      expect(html).toContain('<strong>Page 1 of 21</strong>')
      expect(html).toContain(`<span>${rows.length.toLocaleString('en-PH')} rows · 50 per page</span>`)
      expect(html).toContain('<a class="finance-secondary-link" href="/catalogue?page=2">Next</a>')
      expect(html).not.toContain('>Previous<')
      expect(html.match(/<h1/g)).toHaveLength(1)
    })

    it('finds LB-0001 and shows its price in pesos', async () => {
      const wage = rowOf('LB-0001')
      const html = await listPage({ q: 'LB-0001' })
      const [row, ...others] = dataRows(html)

      expect(others).toHaveLength(0)
      expect(row).toContain('<strong>LB-0001</strong>')
      expect(row).toContain(`<span class="finance-cell-detail">${escaped(wage.name)}</span>`)
      expect(wage.price).toEqual({ low: 75_500, avg: 75_500, high: 75_500 })
      expect(formatCents(75_500)).toMatch(/^₱\s?755\.00$/)
      expect(row).toContain(amountCells([75_500, 75_500, 75_500]))
      expect(row).toContain('<td>NCR</td>')
      expect(row).toContain('rel="noopener noreferrer">nwpc.dole.gov.ph')
      expect(html).toContain('<strong>Page 1 of 1</strong>')
      // The search state is kept in the form.
      expect(html).toContain('name="q" value="LB-0001"')
    })

    it('returns only the chosen trade', async () => {
      const paint = rows.filter((row) => row.trade === 'paint')
      const html = await listPage({ trade: 'paint' })

      expect(dataRows(html)).toHaveLength(Math.min(PAGE_SIZE, paint.length))
      for (const row of dataRows(html)) {
        expect(row).toContain('<td>Paint</td>')
        expect(row).toMatch(/<strong>PT-\d{4}<\/strong>/)
      }
      expect(html).toContain(`<span>${paint.length} rows · 50 per page</span>`)
      expect(html).toContain('<option value="paint" selected="">Paint</option>')
    })

    it('shows each unpriced item with its "No source" chip, its note and no amount', async () => {
      const unpriced = rows.filter((row) => !row.price)
      const html = await listPage({ status: 'no_source' })

      expect(dataRows(html)).toHaveLength(PAGE_SIZE)
      expect(html).toContain(`<span>${unpriced.length} rows · 50 per page</span>`)
      for (const row of dataRows(html)) {
        const code = /<strong>([A-Z]{2}-\d{4})<\/strong>/.exec(row)?.[1] ?? ''
        const source = rowOf(code)
        expect(source.price, code).toBeNull()
        expect(row, code).toContain(
          '<span class="finance-status finance-status-draft">No source</span>',
        )
        expect(row, code).not.toContain('class="currency"')
        // The note stands where the amounts would be: in full, or cut with the
        // full text as its title.
        expect(source.notes, code).toEqual(expect.any(String))
        expect(row, code).toContain('<td colSpan="3">')
        expect(row, code).toContain(escaped(source.notes ?? ''))
      }
    })
  })

  describe('the item page', () => {
    it('shows a priced item: its code as the title, its three amounts and its source host', async () => {
      signIn('estimator')
      const tube = rowOf('EL-0048')
      const html = await itemPage(itemIds.get('EL-0048') ?? '')

      expect(html).toContain('<h1 class="page-title">EL-0048</h1>')
      expect(html.match(/<h1/g)).toHaveLength(1)
      expect(html).toContain(`<h2>${escaped(tube.name)}</h2>`)
      expect(html).toContain('<strong>Trade</strong><span>Electrical</span>')
      expect(html).toContain(`<strong>Unit</strong><span>${escaped(tube.unit)}</span>`)
      expect(html).toContain(
        `<strong>Specification</strong><span>${escaped(tube.specification ?? '')}</span>`,
      )
      expect(tube.price).toEqual({ low: 19_875, avg: 23_388, high: 26_900 })
      expect(html).toContain(amountCells([19_875, 23_388, 26_900]))
      expect(html).toContain(
        `<a href="${escaped(tube.source_url ?? '')}" target="_blank" rel="noopener noreferrer">shop.wilcon.com.ph`,
      )
      expect(html).toContain('<span class="finance-status finance-status-draft">One source</span>')
      expect(html).toContain(`<td>${escaped(tube.notes ?? '')}</td>`)
      expect(html).toContain('1 entry.')
    })

    it('shows an unpriced item: the observation without a price, with its note in full', async () => {
      signIn('estimator')
      const pump = rowOf('CN-0037')
      const html = await itemPage(itemIds.get('CN-0037') ?? '')
      const history = dataRows(html)

      expect(pump.price).toBeNull()
      expect((pump.notes ?? '').length).toBeGreaterThan(80)
      expect(html).toContain('<h1 class="page-title">CN-0037</h1>')
      expect(history).toHaveLength(1)
      expect(history[0]).toContain(`<td>${escaped(pump.region)}</td>`)
      expect(history[0]).toContain(amountCells([null, null, null]))
      expect(history[0]).toContain(
        '<span class="finance-status finance-status-draft">No source</span>',
      )
      expect(history[0]).toContain(`<td>${escaped(pump.notes ?? '')}</td>`)
      expect(html).not.toContain(`title="${escaped(pump.notes ?? '')}"`)
    })

    it('renders the two admin forms for a role with catalogue.manage and none for a reader', async () => {
      const tube = rowOf('EL-0048')
      const itemId = itemIds.get('EL-0048') ?? ''

      signIn('commercial')
      const managed = await itemPage(itemId)
      expect(managed.match(/<form class="finance-setup-form"/g)).toHaveLength(2)
      expect(managed).toContain('<h2>Edit item</h2>')
      expect(managed).toContain(`<input type="hidden" name="id" value="${itemId}"/>`)
      expect(managed).toContain(`name="name" value="${escaped(tube.name)}"`)
      expect(managed).toContain('<option value="electrical" selected="">Electrical</option>')
      expect(managed).toContain('<h2>Record a price</h2>')
      expect(managed).toContain(`<input type="hidden" name="item_id" value="${itemId}"/>`)
      expect(managed).toContain('<button type="submit" class="finance-primary-button">Save item</button>')
      expect(managed).toContain(
        '<button type="submit" class="finance-primary-button">Record price</button>',
      )

      signIn('estimator')
      const read = await itemPage(itemId)
      expect(read).toContain('<h1 class="page-title">EL-0048</h1>')
      expect(read).not.toContain('<form')
      expect(read).not.toContain('Edit item')
      expect(read).not.toContain('Record a price')
    })

    it('is not-found for an id no item has, a malformed id and another tenant’s reader', async () => {
      signIn('estimator')
      await expect(itemPage(randomUUID())).rejects.toThrow(NOT_FOUND)
      await expect(itemPage('EL-0048')).rejects.toThrow(NOT_FOUND)

      // The item exists, but not for this tenant.
      signIn('admin', randomUUID())
      await expect(itemPage(itemIds.get('EL-0048') ?? '')).rejects.toThrow(NOT_FOUND)
    })
  })
})
