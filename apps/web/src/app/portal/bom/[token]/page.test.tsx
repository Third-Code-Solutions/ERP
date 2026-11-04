import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ loadPortalBom: vi.fn(), recordSign: vi.fn() }))
vi.mock('./sign-actions', () => mocks)
import PortalBomPage from './page'

describe('legacy BOM signing navigation', () => {
  beforeEach(() => vi.clearAllMocks())

  async function render(
    slug: string | null,
    isDevStub = false,
    tcvCents = 10000,
    taxRates = { vatBps: 1200, retentionBps: 1000 },
  ) {
    mocks.loadPortalBom.mockResolvedValue({
      state: 'ok',
      bom: {
        id: '33333333-3333-4333-8333-333333333333', version: 1,
        project_name: 'Fixture project', account_name: null,
        tcv_cents: tcvCents, valid_until: '2030-01-01T00:00:00Z',
        docuseal_slug: slug, is_dev_stub: isDevStub, lines: [],
      },
      taxRates,
    })
    return renderToStaticMarkup(await PortalBomPage({ params: Promise.resolve({ token: 'fixture-token' }) }))
  }

  it('opens complete HTTPS signing links without an iframe or invented route', async () => {
    const html = await render('https://sign.example.invalid/s/fixture')
    expect(html).toContain('href="https://sign.example.invalid/s/fixture"')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('/portal/dev-sign/')
    expect(html).not.toContain('counter-signed PDF will be emailed')
  })

  it.each(['legacy-slug', 'http://sign.example.invalid', 'javascript:alert(1)', '//sign.example.invalid', 'https://user:password@sign.example.invalid', null])(
    'does not invent a destination for %s', async (slug) => {
      const html = await render(slug)
      expect(html).not.toContain('<iframe')
      expect(html).not.toContain('/portal/dev-sign/')
      expect(html).toContain('Ask the project team for a current secure signing link')
    },
  )

  it('keeps development signing links disabled', async () => {
    const html = await render('https://sign.example.invalid/s/fixture', true)
    expect(html).not.toContain('href="https://sign.example.invalid')
    expect(html).not.toContain('<form')
    expect(html).toContain('cannot record an approval')
  })

  it('PV-3: totals use the integer half-up formula and label the loaded rates', async () => {
    const html = await render(null, false, 1_234_565)
    expect(html).toContain('VAT (12%)')
    expect(html).toContain('Retention (10%)')
    expect(html).toContain('₱1,481.48')
    expect(html).toContain('₱1,234.57')
    expect(html).toContain('₱12,592.56')
  })

  it("labels and prices the tenant profile's rates", async () => {
    const html = await render(null, false, 1_000_000, { vatBps: 1250, retentionBps: 500 })
    expect(html).toContain('VAT (12.5%)')
    expect(html).toContain('Retention (5%)')
    expect(html).toContain('₱1,250.00')
    expect(html).toContain('₱500.00')
    expect(html).toContain('₱10,750.00')
  })
})
