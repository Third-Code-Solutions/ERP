import { expect, test } from '@playwright/test'

type HarnessState = {
  tenantId: string
  userId: string
  projectId: string
  vendorId: string
  costCodeId: string
  foreignProjectId: string
  purchaseOrders: Array<{
    id: string
    po_number: string
    status: string
    project_id: string
    vendor_id: string | null
    subtotal_cents: number
    vat_cents: number
    withholding_tax_cents: number
    total_cents: number
  }>
  purchaseOrderLines: Array<{
    id: string
    po_id: string
    description: string
    quantity: number
    unit_cost_cents: number
    line_total_cents: number
    cost_code_id: string | null
  }>
  purchaseOrderCreateRequests: Array<{
    id: string
    idempotency_key: string
    state: string
    purchase_order_id: string | null
    result: { purchaseOrderId?: string; poNumber?: string; status?: string } | null
  }>
  coreRequests: Array<{
    method: string
    path: string
    authorization: string
    requestId: string
    idempotencyKey: string
    body: string
  }>
  auditEntries: Array<{
    entity_type: string
    entity_id: string
    action: string
    diff: Record<string, unknown>
  }>
}

type HarnessSession = {
  accessToken: string
  expiresAt: number
  user: Record<string, unknown>
}

const AUTH_ORIGIN = 'http://127.0.0.1:4418'
const CORE_ORIGIN = 'http://127.0.0.1:4419'

async function readState(page: import('@playwright/test').Page) {
  const response = await page.request.get(`${AUTH_ORIGIN}/__harness__/state`)
  expect(response.ok()).toBe(true)
  return (await response.json()) as HarnessState
}

function localAccessToken(userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      aud: 'authenticated',
      exp: 4_102_444_800,
      role: 'authenticated',
      sub: userId,
    })
  ).toString('base64url')
  return `${header}.${payload}.local-notification-signature`
}

test('creates standalone Purchase Order through Core with tenant and idempotency controls', async ({ page }) => {
  const sessionResponse = await page.request.get(`${AUTH_ORIGIN}/__harness__/session`)
  expect(sessionResponse.ok()).toBe(true)
  const session = (await sessionResponse.json()) as HarnessSession
  await page.context().addCookies([
    {
      name: 'sb-127-auth-token',
      value: `base64-${Buffer.from(
        JSON.stringify({
          access_token: session.accessToken,
          refresh_token: 'local-po-refresh-token',
          expires_in: session.expiresAt - Math.floor(Date.now() / 1000),
          expires_at: session.expiresAt,
          token_type: 'bearer',
          user: session.user,
        })
      ).toString('base64')}`,
      url: 'http://127.0.0.1:4417',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
      expires: session.expiresAt,
    },
  ])
  const pageResponse = await page.goto('/purchase-orders', {
    waitUntil: 'domcontentloaded',
  })
  expect(pageResponse?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible()
  await page.getByRole('button', { name: /^\+?\s*create po$/i }).click()

  const initial = await readState(page)
  await page.locator('select[name="project_id"]').selectOption(initial.projectId)
  await page.locator('select[name="vendor_id"]').selectOption(initial.vendorId)
  await page.getByPlaceholder('Description *').fill('Core canary concrete package')
  await page.locator('table select').first().selectOption(initial.costCodeId)
  await page.locator('input[placeholder="0.00"]').fill('100.00')
  await page.locator('input[type="number"]').first().fill('3')

  const actionResponsePromise = page.waitForResponse(
    (response) => Boolean(response.request().headers()['next-action']),
    { timeout: 20_000 }
  )
  await page.getByRole('button', { name: /^create po$/i }).click()
  const actionResponse = await actionResponsePromise
  expect(
    actionResponse.status(),
    'Purchase Order server action response must be successful'
  ).toBe(200)
  await expect
    .poll(async () => (await readState(page)).purchaseOrders.length, {
      timeout: 20_000,
    })
    .toBe(1)

  const created = await readState(page)
  const createdPo = created.purchaseOrders[0]!
  const createdLine = created.purchaseOrderLines[0]!
  const createdRequest = created.purchaseOrderCreateRequests[0]!
  expect(created.purchaseOrders).toHaveLength(1)
  expect(createdPo).toMatchObject({
    po_number: 'PO-0001',
    status: 'draft',
    project_id: initial.projectId,
    vendor_id: initial.vendorId,
    subtotal_cents: 30_000,
    vat_cents: 3_600,
    withholding_tax_cents: 600,
    total_cents: 33_000,
  })
  expect(created.purchaseOrderLines).toHaveLength(1)
  expect(createdLine).toMatchObject({
    po_id: createdPo.id,
    description: 'Core canary concrete package',
    quantity: 3,
    unit_cost_cents: 10_000,
    line_total_cents: 30_000,
    cost_code_id: initial.costCodeId,
  })
  expect(created.purchaseOrderCreateRequests).toHaveLength(1)
  expect(createdRequest).toMatchObject({
    state: 'succeeded',
    purchase_order_id: createdPo.id,
  })
  expect(createdRequest.result).toMatchObject({
    purchaseOrderId: createdPo.id,
    poNumber: 'PO-0001',
    status: 'draft',
  })

  const poAudit = created.auditEntries.filter(
    (entry) => entry.entity_type === 'purchase_order' && entry.action === 'create'
  )
  expect(poAudit).toHaveLength(1)
  expect(poAudit[0]?.entity_id).toBe(createdPo.id)

  const poRequests = created.coreRequests.filter(
    (request) => request.path === '/v1/procurement/purchase-orders'
  )
  expect(poRequests).toHaveLength(1)
  expect(poRequests[0]?.method).toBe('POST')
  expect(poRequests[0]?.authorization).toBe(
    `Bearer ${localAccessToken(initial.userId)}`
  )
  expect(poRequests[0]?.requestId).toMatch(/^[0-9a-f-]{36}$/i)
  expect(poRequests[0]?.idempotencyKey).toMatch(/^[-0-9a-f]{36}$/i)
  expect(JSON.parse(poRequests[0]?.body ?? '{}')).toMatchObject({
    projectId: initial.projectId,
    vendorId: initial.vendorId,
    lines: [
      expect.objectContaining({
        description: 'Core canary concrete package',
        quantity: 3,
        unitCostCents: 10_000,
        costCodeId: initial.costCodeId,
      }),
    ],
  })

  const foreignResponse = await page.request.post(
    `${CORE_ORIGIN}/v1/procurement/purchase-orders`,
    {
      headers: {
        authorization: `Bearer ${localAccessToken(initial.userId)}`,
        'content-type': 'application/json',
        'Idempotency-Key': 'foreign-po-tenant-isolation-1',
        'x-request-id': crypto.randomUUID(),
      },
      data: {
        projectId: initial.foreignProjectId,
        vendorId: null,
        deliveryDate: null,
        notes: null,
        lines: [
          {
            description: 'Must not cross tenant boundary',
            quantity: 1,
            unitCostCents: 1_000,
            costCodeId: initial.costCodeId,
          },
        ],
      },
    }
  )
  expect(foreignResponse.status()).toBe(404)
  const afterForeign = await readState(page)
  expect(afterForeign.purchaseOrders).toHaveLength(1)
})
